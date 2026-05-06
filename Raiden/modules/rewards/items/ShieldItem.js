var ShieldItem = (() => {
    class ShieldItem extends ItemBase {
        constructor(x, y) {
            super(x, y, { kind: 'shield', label: 'S', color: '#38f', glow: 'rgba(50,150,255,0.4)' });
        }
        _drawIcon(ctx, fc) {
            const R = 8.5;
            // Hexagon fill
            ctx.fillStyle = 'rgba(40,100,255,0.80)';
            ctx.strokeStyle = '#8cf';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = i * Math.PI / 3 - Math.PI / 6;
                i === 0
                    ? ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R)
                    : ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
            }
            ctx.closePath(); ctx.fill(); ctx.stroke();
            // Inner cross emblem
            ctx.strokeStyle = 'rgba(180,220,255,0.70)';
            ctx.lineWidth = 1.2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(0, -4); ctx.lineTo(0, 4);
            ctx.moveTo(-3.5, 0); ctx.lineTo(3.5, 0);
            ctx.stroke();
            ctx.lineCap = 'butt';
        }
    }
    return { ShieldItem };
})();

ItemRegistry.register({ label:'SHIELD', col:'#38f', mk:()=>new ShieldItem.ShieldItem(0,0) });
