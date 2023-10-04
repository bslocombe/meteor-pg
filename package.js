Package.describe({
  name: 'bslocombe:pg',
  summary: 'PostgreSQL support with Reactive Select Subscriptions',
  version: '1.0.8',
  git: 'https://github.com/bslocombe/meteor-pg.git'
});

Npm.depends({
  'pg': '8.0.3',
  'lodash': '4.17.21',
  'ejson': '2.2.0'
})

Package.onUse(function(api) {
  api.versionsFrom('2.11.0');
  api.use('ecmascript');
  api.addAssets([
    'lib/refresh.tpl.sql',
    'lib/trigger.tpl.sql'
  ], 'server')
  api.mainModule('LivePg.js', 'server');
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('bslocombe:pg');
  api.mainModule('LivePg-tests.js');
});