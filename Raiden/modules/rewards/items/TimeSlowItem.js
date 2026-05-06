var TimeSlowItem = (() => {
    class TimeSlowItem extends ItemBase {
        constructor(x, y) {
            super(x, y, { kind: 'timeslow', label: 'TM', color: '#aff', glow: 'rgba(160,255,255,0.45)' });
        }
        _drawIcon(ctx, fc) {
            const R = 8;
            // Clock face
            ctx.fillStyle = 'rgba(0,30,50,0.90)';
            ctx.strokeStyle = '#aff';
            ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            // Hour tick marks
            ctx.strokeStyle = 'rgba(160,255,255,0.50)';
            ctx.lineWidth = 0.8;
            for (let i = 0; i < 12; i++) {
                const a = i * Math.PI / 6;
                const r1 = i % 3 === 0 ? R - 2.5 : R - 1.5;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
                ctx.lineTo(Math.cos(a) * (R - 0.7), Math.sin(a) * (R - 0.7));
                ctx.stroke();
            }
            // Hour hand (slow)
            const ha = fc * 0.008 - Math.PI / 2;
            ctx.strokeStyle = '#aff'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ha) * 4.5, Math.sin(ha) * 4.5); ctx.stroke();
            // Minute hand (fast)
            const ma = fc * 0.055 - Math.PI / 2;
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.9;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ma) * 6.5, Math.sin(ma) * 6.5); ctx.stroke();
            ctx.lineCap = 'butt';
            // Center dot
            ctx.fillStyle = '#aff';
            ctx.beginPath(); ctx.arc(0, 0, 1.2, 0, Math.PI * 2); ctx.fill();
        }
    }
    return { TimeSlowItem };
})();

ItemRegistry.register({ label:'TIME SLOW', col:'#aff', mk:()=>new TimeSlowItem.TimeSlowItem(0,0) });
