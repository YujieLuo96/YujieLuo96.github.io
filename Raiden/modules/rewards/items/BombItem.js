var BombItem = (() => {
    class BombItem extends ItemBase {
        constructor(x, y) {
            super(x, y, { kind: 'bomb', label: 'B', color: '#fa0', glow: 'rgba(255,180,0,0.4)' });
        }
        _drawIcon(ctx, fc) {
            // Body
            ctx.fillStyle = '#444';
            ctx.beginPath(); ctx.arc(0, 2, 5.5, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#777'; ctx.lineWidth = 0.8; ctx.stroke();
            // Shine
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            ctx.beginPath(); ctx.arc(-1.5, 0.5, 2, 0, Math.PI * 2); ctx.fill();
            // Fuse
            ctx.strokeStyle = '#bba'; ctx.lineWidth = 1.1;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(0, -3);
            ctx.quadraticCurveTo(4, -7, 1, -10);
            ctx.stroke();
            ctx.lineCap = 'butt';
            // Animated spark at fuse tip
            const flicker = 0.65 + Math.sin(fc * 0.5) * 0.35;
            ctx.fillStyle = `rgba(255,200,60,${flicker.toFixed(2)})`;
            ctx.beginPath(); ctx.arc(1, -10, 1.8, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = `rgba(255,255,180,${(flicker * 0.7).toFixed(2)})`;
            ctx.beginPath(); ctx.arc(1, -10, 0.9, 0, Math.PI * 2); ctx.fill();
        }
    }
    return { BombItem };
})();

ItemRegistry.register({ label:'BOMB', col:'#fa0', mk:()=>new BombItem.BombItem(0,0) });
