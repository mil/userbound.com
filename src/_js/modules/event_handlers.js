'use strict';

module.exports = function($, globals, util, router) {
  function subsection_button_click(e) {
    var subsection = e.target.innerHTML.toLowerCase();

    // Models follows a different schema since its only subpage with stubs
    router.navigate(
      window.location.href.match(/\/works\/(?!cad|music).+/) ?
        "/works/" + util.trim($.z("h1").text()) + "/" + subsection.replace(" ", "-") :
        "/" + $.z("h1").text().toLowerCase() + "/" + subsection.replace(" ", "-")
      );
  }

  function install_dom_event_bindings() {
    // Setup click callbacks for links and subsection clicking
    $.z(".filter-by button").on("click", subsection_button_click);
    $.z("img[data-category-model]").on("click", function() {$.z($.z(".filter-by button")[1]).click()});
  }

  return {
    install_dom_event_bindings: install_dom_event_bindings
  };
}
