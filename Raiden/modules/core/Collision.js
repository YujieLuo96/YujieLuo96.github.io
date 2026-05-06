var Collision = (() => {
    return {
        // AABB – bounds use {x,y,w,h}
        rectsOverlap(a, b) {
            return a.x < b.x + b.w && a.x + a.w > b.x &&
                   a.y < b.y + b.h && a.y + a.h > b.y;
        },
        // Circle vs AABB
        circleRect(cx, cy, cr, b) {
            const nx = Math.max(b.x, Math.min(cx, b.x + b.w));
            const ny = Math.max(b.y, Math.min(cy, b.y + b.h));
            const dx = cx - nx, dy = cy - ny;
            return dx * dx + dy * dy < cr * cr;
        },
        circleCircle(ax, ay, ar, bx, by, br) {
            const dx = ax - bx, dy = ay - by, r = ar + br;
            return dx * dx + dy * dy < r * r;
        }
    };
})();
