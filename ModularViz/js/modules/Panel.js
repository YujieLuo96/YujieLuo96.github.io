/**
 * Panel — right-side detail / edit panel
 *
 * Displays one of two mutually exclusive views:
 *   Node panel:  title / color / LaTeX content editor + live preview
 *   Edge panel:  connection direction / label editor + live preview
 *
 * Listens to EB:
 *   panel:showNode — open node panel
 *   panel:showEdge — open edge panel
 *   panel:close    — close panel
 */

import { EB }    from '../core/EventBus.js';
import { Store } from '../core/Store.js';
import { LX }    from '../core/LatexUtil.js';
import { App }   from '../state/AppState.js';
import { NM }    from './NodeModule.js';
import { EM }    from './EdgeModule.js';

let _debTimer = null;
function _debounce(fn) { clearTimeout(_debTimer); _debTimer = setTimeout(fn, 280); }

const _el    = id => document.getElementById(id);
const _panel = () => _el('panel');
const _body  = () => _el('panel-body');
const _title = () => _el('panel-title');
const _btnDel= () => _el('btn-del');

function open()  { _panel().classList.add('open'); }

function close() {
  _panel().classList.remove('open');
  NM.clearAllSel();
  App.selNode = null;
  App.selEdge = null;
}

function _esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _field(labelText, innerHtml) {
  const div = document.createElement('div');
  div.className = 'pf';
  div.innerHTML = `<div class="pf-label">${labelText}</div>${innerHtml}`;
  return div;
}

function _inputHtml(type, id, value = '', placeholder = '') {
  return `<input type="${type}" class="pi" id="${id}"
           value="${_esc(value)}" placeholder="${_esc(placeholder)}">`;
}

function showNode(id) {
  const data = Store.nodes.get(id); if (!data) return;

  _title().textContent = 'Node Details';
  _body().innerHTML = '';

  _body().appendChild(_field('Title', _inputHtml('text', 'pf-title', data.title)));

  const colorSection = document.createElement('div');
  colorSection.className = 'pf';
  const colorLabel = document.createElement('div');
  colorLabel.className = 'pf-label';
  colorLabel.textContent = 'Color';
  colorSection.appendChild(colorLabel);
  colorSection.appendChild(_buildColorRow(data));
  _body().appendChild(colorSection);

  _body().appendChild(
    _field('Content (LaTeX supported)',
      `<textarea class="pi" id="pf-ct" rows="6">${_esc(data.content)}</textarea>`)
  );

  _body().appendChild(_field('Preview', '<div class="preview-box" id="pf-prev"></div>'));
  const prevEl = _el('pf-prev');
  LX.render(data.content, prevEl);

  _el('pf-title').addEventListener('input', e => {
    data.title = e.target.value;
    NM.updateEl(data);
  });

  _el('pf-ct').addEventListener('input', e => {
    data.content = e.target.value;
    NM.updateEl(data);
    _debounce(() => LX.render(data.content, prevEl));
  });

  _btnDel().onclick = () => { NM.remove(id); close(); };
  open();
}

function _buildColorRow(data) {
  const row = document.createElement('div');
  row.className = 'color-row';

  NM.COLORS.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'cswatch' + (c === data.color ? ' active' : '');
    sw.style.background = c;
    sw.dataset.c = c;
    sw.addEventListener('click', () => {
      data.color = c;
      NM.updateEl(data);
      row.querySelectorAll('.cswatch').forEach(s =>
        s.classList.toggle('active', s.dataset.c === c)
      );
      customPicker.value = c;
    });
    row.appendChild(sw);
  });

  const customPicker = document.createElement('input');
  customPicker.type  = 'color';
  customPicker.value = data.color;
  customPicker.title = 'Custom color';
  customPicker.style.cssText =
    'width:22px;height:22px;border:none;padding:0;cursor:pointer;border-radius:50%;overflow:hidden;flex-shrink:0';
  customPicker.addEventListener('input', () => {
    data.color = customPicker.value;
    NM.updateEl(data);
    row.querySelectorAll('.cswatch').forEach(s => s.classList.remove('active'));
  });
  row.appendChild(customPicker);

  return row;
}

function showEdge(id) {
  const data = Store.edges.get(id); if (!data) return;
  const src  = Store.nodes.get(data.sourceId);
  const tgt  = Store.nodes.get(data.targetId);

  _title().textContent = 'Connection Details';
  _body().innerHTML = '';

  const infoSection = document.createElement('div');
  infoSection.className = 'pf';
  const infoLabel = document.createElement('div');
  infoLabel.className = 'pf-label';
  infoLabel.textContent = 'Connection';
  const infoBox = document.createElement('div');
  infoBox.className = 'edge-info-box';
  infoBox.innerHTML =
    `${_esc(src?.title || '?')} <span class="edge-arrow-sym">→</span> ${_esc(tgt?.title || '?')}`;
  infoSection.appendChild(infoLabel);
  infoSection.appendChild(infoBox);
  _body().appendChild(infoSection);

  _body().appendChild(
    _field('Label (LaTeX / text)',
      _inputHtml('text', 'pf-tag', data.tag, 'Enter label…'))
  );

  _body().appendChild(_field('Preview', '<div class="preview-box" id="pf-eprev"></div>'));
  const prevEl = _el('pf-eprev');
  LX.render(data.tag, prevEl);

  _el('pf-tag').addEventListener('input', e => {
    data.tag = e.target.value;
    EM.update(id);
    _debounce(() => LX.render(data.tag, prevEl));
  });

  _btnDel().onclick = () => { EM.remove(id); close(); };
  open();
}

function init() {
  _el('panel-close').addEventListener('click', close);

  EB.on('panel:showNode', id => showNode(id));
  EB.on('panel:showEdge', id => showEdge(id));
  EB.on('panel:close',    ()  => close());
}

export const Panel = { init, showNode, showEdge, close };
