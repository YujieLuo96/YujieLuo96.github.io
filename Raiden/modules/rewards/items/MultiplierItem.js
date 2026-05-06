var MultiplierItem = (() => {
    class MultiplierItem extends ItemBase {
        constructor(x, y) {
            super(x, y, { kind: 'multiplier', label: 'x2', color: '#ff8', glow: 'rgba(255,240,100,0.45)' });
        }
        _drawIcon(ctx, fc) {
            const pulse = 0.82 + Math.sin(fc * 0.08) * 0.18;
            ctx.globalAlpha = pulse;
            // × symbol
            ctx.strokeStyle = '#ff6';
            ctx.lineWidth = 2.2;
            ctx.lineCap = 'round';
            ctx.shadowColor = '#ff6';
            ctx.shadowBlur = 5;
            ctx.beginPath();
            ctx.moveTo(-5, -5); ctx.lineTo(1, 1);
            ctx.moveTo(1, -5); ctx.lineTo(-5, 1);
            ctx.stroke();
            // "2"
            ctx.shadowBlur = 0;
            ctx.lineCap = 'butt';
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px "Courier New",monospace';
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText('2', 3, -2);
            ctx.globalAlpha = 1;
        }
    }
    return { MultiplierItem };
})();

ItemRegistry.register({ label:'MULTIPLIER', col:'#ff8', mk:()=>new MultiplierItem.MultiplierItem(0,0) });
