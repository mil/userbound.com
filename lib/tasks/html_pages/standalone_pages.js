'use strict';
module.exports = function(gulp, $, util, mutators, globals) {

  var layout = "default";
  $._.each([
    {
      taskname: "clients",
      fp: "clients/index.html",
      title: "Clients",
      path: "clients",
      page_layout: layout
    },
    {
      taskname: "about",
      fp: "about/index.html",
      title: "About",
      path: "about",
      page_layout: layout
    },
    {
      taskname: "cv",
      fp: "cv/index.html",
      title: "Cirriculum Vitae",
      path: "cv",
      page_layout: "cv",
      layout: "cv"
    }
  ], function(p) {
    gulp.task(p.taskname, function() {
      return gulp
        .src(util.fs_in(p.fp))
        .pipe($.fem({ property: 'vars', remove : true }))
        .pipe($.markdown())
        .pipe($.data(util.extract_nav_links))
        .pipe($.data(util.install_templating_vars(p)))
        .pipe($.replace(/[\s\S]*/,  util.read_file(util.fs_in([
          "_layouts/",
          (
            typeof p.layout !== "undefined" ?
              p.layout : p.page_layout
          ),
          ".html"
        ].join("")))))
        .pipe($.swig(globals.swig_opts))
        .pipe($.dom(
          function() { return mutators.target_blank_external_links.call(this); }
        ))
        .pipe(gulp.dest(util.fs_out(p.path)));
    });
  });
}
