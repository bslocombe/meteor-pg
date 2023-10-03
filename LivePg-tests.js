// Import Tinytest from the tinytest Meteor package.
import { Tinytest } from "meteor/tinytest";

// Import and rename a variable exported by pg2.js.
import { LivePg as packageName } from "meteor/bslocombe:pg2";

// Write your tests here!
// Here is an example.
Tinytest.add('LivePg - example', function (test) {
  test.equal(packageName, "LivePg");
});
