var EventBus = (() => {
    const _map = {};
    return {
        on(ev, fn) {
            (_map[ev] = _map[ev] || []).push(fn);
            return () => this.off(ev, fn);
        },
        off(ev, fn) {
            if (_map[ev]) _map[ev] = _map[ev].filter(f => f !== fn);
        },
        emit(ev, data) {
            (_map[ev] || []).slice().forEach(f => f(data));
        },
        clear() {
            Object.keys(_map).forEach(k => (_map[k] = []));
        }
    };
})();
