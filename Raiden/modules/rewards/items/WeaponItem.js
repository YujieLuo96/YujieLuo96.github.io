var WeaponItem = (() => {
    const CONFIGS = {
        spread_w:    { label: 'SP', color: '#4af',    glow: 'rgba(60,180,255,0.45)'  },
        laser_w:     { label: 'LA', color: '#4f8',    glow: 'rgba(60,255,120,0.45)'  },
        homing_w:    { label: 'HM', color: '#c4f',    glow: 'rgba(180,80,255,0.45)'  },
        plasma_w:    { label: 'PL', color: '#f55',    glow: 'rgba(255,80,80,0.45)'   },
        lightning_w: { label: 'LG', color: '#fff8a0', glow: 'rgba(255,240,64,0.45)'  },
        ice_w:       { label: 'IC', color: '#a0f0ff', glow: 'rgba(80,220,255,0.45)'  },
        satellite_w: { label: 'ST', color: '#ffb830', glow: 'rgba(255,184,48,0.45)'  },
        graviton_w:  { label: 'GR', color: '#cc60ff', glow: 'rgba(204,96,255,0.45)'  },
        shatter_w:   { label: 'SH', color: '#5fefff', glow: 'rgba(95,239,255,0.45)'  }
    };
    class WeaponItem extends ItemBase {
        constructor(x, y, weapKind) {
            const cfg = CONFIGS[weapKind] || CONFIGS['spread_w'];
            super(x, y, { kind: weapKind, label: cfg.label, color: cfg.color, glow: cfg.glow });
        }
        _drawIcon(ctx, fc) {
            const [r, g, b] = this._gr;
            const pulse = 0.6 + Math.sin(fc * 0.08 + this.pulse) * 0.4;
            // Glowing label
            ctx.fillStyle = '#fff';
            ctx.shadowColor = `rgb(${r},${g},${b})`;
            ctx.shadowBlur = Math.round(5 * pulse);
            ctx.font = 'bold 8px "Courier New",monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(this.label, 0, -2);
            ctx.shadowBlur = 0;
            // Beam accent line
            ctx.strokeStyle = `rgba(${r},${g},${b},${pulse.toFixed(2)})`;
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-7, 5); ctx.lineTo(7, 5);
            ctx.stroke();
            ctx.lineCap = 'butt';
        }
    }
    return { WeaponItem };
})();

ItemRegistry.register({ label:'WEAPON ITEM', col:'#4f8', mk:()=>new WeaponItem.WeaponItem(0,0,'spread_w') });
