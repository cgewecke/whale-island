'use strict'

// Bleno mocks for Travis CI build
module.exports.Characteristic = class Characteristic{ constructor(obj){} };
module.exports.PrimaryService = class PrimaryService{ constructor(obj){} };
module.exports.startAdvertising = (val, array, fn) => {};
module.exports.startAdvertisingIBeacon = (uuid, major, minor, power, fn) => {};
module.exports.setServices = (array) => {};
module.exports.disconnect = () => {};
module.exports.on = (event, fn) => {};
