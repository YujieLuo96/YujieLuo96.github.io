'use strict';

/* ═══════════════════════════════════════════════════════════
   CryptoIO — N-layer RSA-OAEP + AES-GCM encrypted save/load
   deps: Status, _applyGraph, _buildPayload  (from IO.js)
═══════════════════════════════════════════════════════════ */
const CryptoIO = (() => {
  const RSA_HASH = 'SHA-256';

  // ── Base64 helpers (chunked to avoid stack overflow on large buffers) ──

  function b64enc(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < u8.length; i += CHUNK)
      s += String.fromCharCode(...u8.subarray(i, i + CHUNK));
    return btoa(s);
  }

  function b64dec(str) {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
  }

  // ── Low-level crypto primitives ──────────────────────────

  async function _genRsaKeyPair() {
    return crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]), hash: RSA_HASH },
      true, ['encrypt', 'decrypt']
    );
  }

  async function _genAesKey() {
    return crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
    );
  }

  async function _aesEncrypt(key, data) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return { ct: new Uint8Array(ct), iv };
  }

  async function _aesDecrypt(key, ct, iv) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new Uint8Array(pt);
  }

  // Wrap raw AES-256 key bytes with RSA public key
  async function _wrapAes(pubKey, aesKey) {
    const raw = await crypto.subtle.exportKey('raw', aesKey);
    const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, raw);
    return new Uint8Array(wrapped);
  }

  // Unwrap AES key with RSA private key → importable CryptoKey
  async function _unwrapAes(privKey, wrappedBytes) {
    const raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privKey, wrappedBytes);
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
  }

  async function _importPrivKey(jwk) {
    return crypto.subtle.importKey(
      'jwk', jwk,
      { name: 'RSA-OAEP', hash: RSA_HASH },
      false, ['decrypt']
    );
  }

  // ── Graph payload helpers ────────────────────────────────

  function _applyPayload(data) {
    if (!Array.isArray(data.nodes) || !Array.isArray(data.edges))
      throw new Error('Invalid graph format');
    const nn = data.nodes.length, ne = data.edges.length;
    _applyGraph(data.nodes, data.edges,
      `Decrypted & loaded ${nn} node${nn !== 1 ? 's' : ''} · ${ne} connection${ne !== 1 ? 's' : ''}`);
  }

  // ── Core: encrypt N layers ───────────────────────────────
  //
  // Encryption order: layer 1 (innermost) → layer N (outermost)
  // Each layer: AES-GCM encrypts data; RSA-OAEP wraps AES key.
  //
  // Output — data file (.enc.json):
  //   { version, algorithm, layers:[{wrappedAesKey,iv}×N], ciphertext }
  //
  // Output — key file (.keys.json):
  //   { version, algorithm, privateKeys:[JWK×N] }
  //
  // N is encoded as privateKeys.length — no need to know it a priori.

  async function encryptSave(n) {
    _setSaveStatus(`Generating ${n} RSA key pair${n > 1 ? 's' : ''}…`);
    let data       = new TextEncoder().encode(JSON.stringify(_buildPayload()));
    const layersInfo    = [];   // goes into data file
    const privateKeyJwks = [];  // goes into key file

    for (let i = 0; i < n; i++) {
      _setSaveStatus(`Encrypting layer ${i + 1} / ${n}…`);
      const kp          = await _genRsaKeyPair();
      const aesKey      = await _genAesKey();
      const { ct, iv }  = await _aesEncrypt(aesKey, data);
      const wrappedAes  = await _wrapAes(kp.publicKey, aesKey);
      const privJwk     = await crypto.subtle.exportKey('jwk', kp.privateKey);

      layersInfo.push({ wrappedAesKey: b64enc(wrappedAes), iv: b64enc(iv) });
      privateKeyJwks.push(privJwk);
      data = ct; // next layer encrypts this ciphertext
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    _download(
      new Blob([JSON.stringify({
        version:   '2.0',
        algorithm: 'RSA-OAEP+AES-GCM',
        layers:    layersInfo,
        ciphertext: b64enc(data)
      })], { type: 'application/json' }),
      `graph_${dateStr}.enc.json`
    );

    // Small delay so browsers don't suppress the second download
    await new Promise(r => setTimeout(r, 350));

    _download(
      new Blob([JSON.stringify({
        version:     '2.0',
        algorithm:   'RSA-OAEP+AES-GCM',
        privateKeys: privateKeyJwks
      })], { type: 'application/json' }),
      `graph_${dateStr}.keys.json`
    );

    _setSaveStatus(`Done! 2 files downloaded (${n}-layer encryption).`);
    setTimeout(_hideSaveModal, 1800);
  }

  // ── Core: decrypt N layers ───────────────────────────────
  //
  // Decryption order: layer N (outermost) → layer 1 (innermost)
  // N is read directly from privateKeys.length in the key file.

  async function decryptLoad(dataText, keyText) {
    const dataObj = JSON.parse(dataText);
    const keyObj  = JSON.parse(keyText);

    if (dataObj.version !== '2.0') throw new Error('Unsupported data file version');
    if (keyObj.version  !== '2.0') throw new Error('Unsupported key file version');

    const privKeys = keyObj.privateKeys;
    const n        = privKeys.length;

    if (!Array.isArray(dataObj.layers) || dataObj.layers.length !== n)
      throw new Error(
        `Key file declares ${n} layer${n !== 1 ? 's' : ''} but data file has ` +
        `${dataObj.layers?.length ?? '?'} — files do not match`
      );

    let ct = b64dec(dataObj.ciphertext);

    // Peel from outermost layer (index n-1) inward to layer 0
    for (let i = n - 1; i >= 0; i--) {
      _setLoadStatus(`Decrypting layer ${n - i} / ${n}…`);
      const privKey = await _importPrivKey(privKeys[i]);
      const layer   = dataObj.layers[i];
      const aesKey  = await _unwrapAes(privKey, b64dec(layer.wrappedAesKey));
      ct = await _aesDecrypt(aesKey, ct, b64dec(layer.iv));
    }

    _applyPayload(JSON.parse(new TextDecoder().decode(ct)));
  }

  // ── UI helpers ───────────────────────────────────────────

  function _download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function _setSaveStatus(msg) {
    const el = document.getElementById('cio-save-status');
    if (el) el.textContent = msg;
  }

  function _setLoadStatus(msg) {
    const el = document.getElementById('cio-load-status');
    if (el) el.textContent = msg;
  }

  // ── Secure Save modal ────────────────────────────────────

  function _showSaveModal() {
    document.getElementById('cio-n-input').value = '3';
    _setSaveStatus('');
    document.getElementById('cio-save-go').disabled = false;
    document.getElementById('cio-save-modal').classList.add('open');
    document.getElementById('cio-save-backdrop').classList.add('open');
  }

  function _hideSaveModal() {
    document.getElementById('cio-save-modal').classList.remove('open');
    document.getElementById('cio-save-backdrop').classList.remove('open');
  }

  // ── Secure Load modal ────────────────────────────────────

  let _dataText = null, _keyText = null;

  function _showLoadModal() {
    _dataText = null; _keyText = null;
    document.getElementById('cio-enc-name').textContent = 'Drop or click to select';
    document.getElementById('cio-key-name').textContent = 'Drop or click to select';
    document.getElementById('cio-enc-zone').classList.remove('loaded');
    document.getElementById('cio-key-zone').classList.remove('loaded');
    _setLoadStatus('');
    document.getElementById('cio-load-btn').disabled = true;
    document.getElementById('cio-load-modal').classList.add('open');
    document.getElementById('cio-load-backdrop').classList.add('open');
  }

  function _hideLoadModal() {
    document.getElementById('cio-load-modal').classList.remove('open');
    document.getElementById('cio-load-backdrop').classList.remove('open');
  }

  function _readText(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsText(file);
    });
  }

  function _setupDropZone(zoneId, inputId, nameId, onText) {
    const zone  = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    const name  = document.getElementById(nameId);

    zone.addEventListener('click', () => input.click());

    input.addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      name.textContent = f.name;
      zone.classList.add('loaded');
      onText(await _readText(f));
      e.target.value = '';
    });

    zone.addEventListener('dragover', e => {
      e.preventDefault(); zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', async e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0]; if (!f) return;
      if (!f.name.toLowerCase().endsWith('.json')) {
        name.textContent = 'Must be a .json file';
        return;
      }
      name.textContent = f.name;
      zone.classList.add('loaded');
      onText(await _readText(f));
    });
  }

  function _checkLoadReady() {
    document.getElementById('cio-load-btn').disabled = !(_dataText && _keyText);
  }

  // ── Init ─────────────────────────────────────────────────

  function init() {
    // Secure Save
    document.getElementById('btn-enc-save').addEventListener('click', _showSaveModal);
    document.getElementById('cio-save-cancel').addEventListener('click', _hideSaveModal);
    document.getElementById('cio-save-backdrop').addEventListener('click', e => {
      if (e.target === e.currentTarget) _hideSaveModal();
    });

    document.getElementById('cio-save-go').addEventListener('click', async () => {
      const n = parseInt(document.getElementById('cio-n-input').value, 10);
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        _setSaveStatus('N must be an integer between 1 and 10.');
        return;
      }
      document.getElementById('cio-save-go').disabled = true;
      try {
        await encryptSave(n);
      } catch (err) {
        _setSaveStatus('Error: ' + err.message);
        document.getElementById('cio-save-go').disabled = false;
      }
    });

    // Secure Load
    document.getElementById('btn-enc-load').addEventListener('click', _showLoadModal);
    document.getElementById('cio-load-cancel').addEventListener('click', _hideLoadModal);
    document.getElementById('cio-load-backdrop').addEventListener('click', e => {
      if (e.target === e.currentTarget) _hideLoadModal();
    });

    _setupDropZone('cio-enc-zone', 'cio-enc-inp', 'cio-enc-name', text => {
      _dataText = text; _checkLoadReady();
    });
    _setupDropZone('cio-key-zone', 'cio-key-inp', 'cio-key-name', text => {
      _keyText = text; _checkLoadReady();
    });

    document.getElementById('cio-load-btn').addEventListener('click', async () => {
      const btn = document.getElementById('cio-load-btn');
      btn.disabled = true;
      _setLoadStatus('Decrypting…');
      try {
        await decryptLoad(_dataText, _keyText);
        _hideLoadModal();
      } catch (err) {
        _setLoadStatus('Error: ' + err.message);
        btn.disabled = false;
      }
    });
  }

  return { init };
})();
