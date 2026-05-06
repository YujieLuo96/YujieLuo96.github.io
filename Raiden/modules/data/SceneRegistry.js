var SceneRegistry = (() => {
    const _defs = [];
    return {
        register(def) { _defs.push(def); },
        getDefs()     { return _defs; }
    };
})();
