(function () {
  function update() {
    var v = window.visualViewport;
    document.documentElement.style.setProperty('--app-height', (v ? v.height : window.innerHeight) + 'px');
  }
  update();
  window.addEventListener('resize', update);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', update);
})();
