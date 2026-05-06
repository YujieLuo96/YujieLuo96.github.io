var PowerItem = (() => {
    class PowerItem extends ItemBase {
        constructor(x, y) {
            super(x, y, { kind: 'power', label: 'P', color: '#f42', glow: 'rgba(255,180,0,0.55)' });
        }
        _drawIcon(ctx, fc) {
            const pulse  = 0.55 + Math.sin(fc * 0.10) * 0.45;
            const flash  = 0.40 + Math.sin(fc * 0.19 + 1.3) * 0.35;

            // Dark inner panel so the bolt pops with high contrast
            ctx.fillStyle = 'rgba(0,0,0,0.48)';
            ctx.beginPath(); ctx.roundRect(-10, -10, 20, 20, 3); ctx.fill();

            // Pulsing energy border ring
            ctx.strokeStyle = `rgba(255,${Math.round(140 + pulse * 80)},0,${(pulse * 0.75).toFixed(2)})`;
            ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.roundRect(-9.5, -9.5, 19, 19, 2); ctx.stroke();

            // Outer aura pass — oversized soft bolt
            ctx.shadowColor = '#ff6000';
            ctx.shadowBlur  = Math.round(10 + pulse * 7);
            ctx.fillStyle   = `rgba(255,140,0,${(pulse * 0.38).toFixed(2)})`;
            ctx.beginPath();
            ctx.moveTo( 4.8, -11);
            ctx.lineTo(-3.2, -0.5);
            ctx.lineTo( 2.2, -0.5);
            ctx.lineTo(-4.8,  11);
            ctx.lineTo( 0.7,  0.6);
            ctx.lineTo(-0.7,  0.6);
            ctx.closePath();
            ctx.fill();

            // Main bolt — animated vivid yellow
            const g = Math.round(200 + flash * 45);
            ctx.fillStyle   = `rgb(255,${g},${Math.round(flash * 30)})`;
            ctx.shadowColor = '#ffaa00';
            ctx.shadowBlur  = Math.round(5 + flash * 4);
            ctx.beginPath();
            ctx.moveTo( 4,   -10);
            ctx.lineTo(-2.5,  -0.5);
            ctx.lineTo( 1.5,  -0.5);
            ctx.lineTo(-4,    10);
            ctx.lineTo( 0.5,   0.5);
            ctx.lineTo(-0.5,   0.5);
            ctx.closePath();
            ctx.fill();

            // White-hot core highlight on upper-right face of bolt
            ctx.shadowBlur  = 0;
            ctx.fillStyle   = `rgba(255,255,210,${(0.50 + flash * 0.30).toFixed(2)})`;
            ctx.beginPath();
            ctx.moveTo( 4,   -10);
            ctx.lineTo( 0.8,  -0.5);
            ctx.lineTo( 1.5,  -0.5);
            ctx.closePath();
            ctx.fill();

            ctx.shadowBlur = 0;
        }
    }
    return { PowerItem };
})();

ItemRegistry.register({ label:'POWER UP', col:'#f42', mk:()=>new PowerItem.PowerItem(0,0) });
