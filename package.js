Package.describe({
  name: 'bslocombe:pg',
  summary: 'PostgreSQL support with Reactive Select Subscriptions',
  version: '1.0.4',
  git: 'https://github.com/bslocombe/meteor-pg.git'
});

Npm.depends({
  'pg': '8.0.3',
  'pg-live-select': 'https://github.com/bslocombe/pg-live-select.git#master',
  'lodash': '4.17.15',
});

Package.onUse(function(api) {
  api.versionsFrom('1.3');
  api.use([
    'underscore',
    'ddp',
    'tracker'
  ]);

  api.addFiles('lib/LivePg.js', 'server');
  api.export('LivePg', 'server');
  api.export('pg', 'server');

});

Package.onTest(function(api) {
  api.use([
    'tinytest',
    'templating',
    'underscore',
    'autopublish',
    'insecure',
    'grigio:babel@0.1.1',
    'bslocombe:pg'
  ]);
  api.use('test-helpers'); // Did not work concatenated above
  api.addFiles([
    'test/helpers/expectResult.js',
    'test/helpers/randomString.js'
  ]);

  api.addFiles([
    'test/fixtures/tpl.html',
    'test/fixtures/tpl.js'
  ], 'client');

  api.addFiles([
    'test/settings/test.pg.json', // Change Postgres port in this file
    'test/helpers/querySequence.js',
    'test/index.es6'
  ], 'server');

  api.addFiles([
    'test/PgSubscription.js'
  ]);
});
