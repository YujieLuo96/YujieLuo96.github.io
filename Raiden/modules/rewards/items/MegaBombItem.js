var MegaBombItem = (() => {
    class MegaBombItem extends ItemBase {
        constructor(x, y) {
            super(x, y, { kind: 'megabomb', label: '★', color: '#ff4', glow: 'rgba(255,230,50,0.5)' });
        }
        _drawIcon(ctx, fc) {
            const rot = fc * 0.022;
            const R = 9, r = 4;
            // Outer glow halo
            const pulse = 0.5 + Math.sin(fc * 0.07) * 0.2;
            ctx.fillStyle = `rgba(255,220,50,${pulse.toFixed(2)})`;
            ctx.beginPath(); ctx.arc(0, 0, R + 2, 0, Math.PI * 2); ctx.fill();
            // Star body
            ctx.fillStyle = '#ffe040';
            ctx.strokeStyle = 'rgba(255,255,160,0.80)';
            ctx.lineWidth = 0.8;
            ctx.shadowColor = '#ffe040';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            for (let i = 0; i < 10; i++) {
                const a = rot + i * Math.PI / 5 - Math.PI / 2;
                const rad = i % 2 === 0 ? R : r;
                i === 0
                    ? ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad)
                    : ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
            }
            ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }
    return { MegaBombItem };
})();

ItemRegistry.register({ label:'MEGA BOMB', col:'#ff4', mk:()=>new MegaBombItem.MegaBombItem(0,0) });
