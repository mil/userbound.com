'use strict';
module.exports = function(gulp, $, util, mutators, globals) {
  gulp.task('gh_cname', function() {
    require('fs').writeFileSync(util.fs_out('CNAME'), 'userbound.com');
  });
}
