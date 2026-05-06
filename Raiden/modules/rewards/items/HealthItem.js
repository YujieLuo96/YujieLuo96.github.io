var HealthItem = (() => {
    class HealthItem extends ItemBase {
        constructor(x, y) {
            super(x, y, { kind: 'health', label: '♥', color: '#3d5', glow: 'rgba(50,220,80,0.4)' });
        }
        _drawIcon(ctx, fc) {
            ctx.fillStyle = '#f66';
            ctx.shadowColor = '#f66';
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.moveTo(0, 6);
            ctx.bezierCurveTo(-9, 0, -9, -8, -4, -8);
            ctx.bezierCurveTo(-1, -8, 0, -5, 0, -5);
            ctx.bezierCurveTo(0, -5, 1, -8, 4, -8);
            ctx.bezierCurveTo(9, -8, 9, 0, 0, 6);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
    return { HealthItem };
})();

ItemRegistry.register({ label:'HEALTH', col:'#f66', mk:()=>new HealthItem.HealthItem(0,0) });
