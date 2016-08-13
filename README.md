# whale-island
[![Build Status](https://travis-ci.org/animist-io/whale-island.svg?branch=master)](https://travis-ci.org/animist-io/whale-island) **This project is in early development. Unusable.**

## Overview
Whale-island is a micro-computer based Ethereum client and Bluetooth beacon that connects to mobile devices via BLE server. Its API targets contract contingencies about location but it can also be used as a simple bluetooth-Ethereum interface to process transactions, deploy contracts and execute methods. An Ionic.js module that helps hybrid mobile apps interact with whale-island is under development at [animist-io/wowshuxkluh](https://github.com/animist-io/wowshuxkluh).

### Features

+ **Client Verification**: Nodes identify their clients by asking them to sign a time-variant pin published on a bluetooth channel. While this doesn't absolutely guarantee a client is proximate to the node, it may be adequate for many moderately valued, well-designed contracts. Spoofing the node typically requires establishing parrallel physical infrastructure that relays node broadcasts and client responses in real time. Whale-island can also be combined with other data sources like Google geo-location to make an oracle that's very difficult to corrupt. Dapps that use client based geo-location alone are vulnerable to highly programmatic spoofing if someone decompiles the app, engineers a way to feed arbitrary location to it and makes the resulting application available to a wider public. 

+ **Beacon:** iOS and Android have permissioned BLE beacons to wake mobile apps up from backgrounded or killed states on detection. This means you can design long-running location-based dapps which automatically connect to an Animist node and publish to the blockchain without requiring a user's explicit engagement. An example use-case for this behavior is a race where the user intentionally places a wager at the beginning and is automatically detected at the end, resolving the contest. Another would be a contract that rewards a client for visiting a location every day for a month without requiring that they check in somewhere. 

+ **Contracts/Events API:** Each node maintains its own account and has its own contract deployed to the blockchain. Dapps that call this contract's event methods and implement the Animist Solidity API in their own contract code can have a node independently verify their client's presence in time. They can also ask the node to broadcast a signal on an arbitrary channel in order to coordinate the behavior of several mobile clients in the same location. For more on how to integrate the Animist API into client contracts see [animist-io/wallowa](https://github.com/animist-io/wallowa).

+ **Presence Receipts:** Whale-island also publishes data that can verify a client's presence without invoking contract methods. Using it's own account, the node signs a timestamp and a verified copy of the clients account address. The client can then present these to an adjudicating authority who extracts the public addresses from the packet and checks the results against node identification data published on IPFS. (See Bluetooth Server API below) 

### Installation

Raspbian Bleno
``` 
$ sudo apt-get install bluetooth bluez libbluetooth-dev libudev-dev 
```

CouchDB (Debian). For OSx download the .dmg directly from Apache
```
$ sudo apt-get install couchdb
$ npm install -g add-cors-to-couchdb
$ add-cors-to-couchdb
```

### Tests 

(set env var TRAVIS to true simulate Travis CI execution)
```
$ mocha --timeout 5s 

$ export TRAVIS=true
$ mocha --timeout 5s 
$ unset TRAVIS
```

### Run 
```
% node lib/server.js start
```

### Generate Docs
```
% gulp documentation
```

### Device UUIDs

Every animist node broadcasts one of five unique beacon uuids and provides access to server API endpoints and contract-triggered broadcast events at corresponding BLE service uuids.

| Beacon UUID | Server UUID  | Broadcast UUID |
| ----------- | ------------ | -------------- |
| <sub><sup> 4F7C5946-87BB-4C50-8051-D503CEBA2F19 </sup></sub> | <sub><sup> 05DEE885-E723-438F-B733-409E4DBFA694 </sup></sub> | <sub><sup> CF5873BB-8F1F-416B-9073-7145864BD97D </sup></sub>|
| <sub><sup> D4FB5D93-B1EF-42CE-8C08-CF11685714EB </sup></sub> | <sub><sup> 9BD991F7-0CB9-4FA7-A075-B3AB1B9CFAC8 </sup></sub> | <sub><sup> C7DAA725-86DC-4A68-BCAB-BF02437B56A2 </sup></sub>|
| <sub><sup> 98983597-F322-4DC3-A36C-72052BF6D612 </sup></sub> | <sub><sup> 98983597-F322-4DC3-A36C-72052BF6D612 </sup></sub> | <sub><sup> 1E3AE004-CB90-408D-A61D-35F588158753 </sup></sub>|
| <sub><sup> 8960D5AB-3CFA-46E8-ADE2-26A3FB462053 </sup></sub> | <sub><sup> 33A93F3C-9CAA-4D39-942A-6659AD039232 </sup></sub> | <sub><sup> B497EFEE-E0D4-47E0-B462-7A6D1A849BE7 </sup></sub>|
| <sub><sup> 458735FA-E270-4746-B73E-E0C88EA6BEE0 </sup></sub> | <sub><sup> 01EC8B5B-B7DB-4D65-949C-81F4FD808A1A </sup></sub> | <sub><sup> 60C9584F-3771-4907-AE3E-CE5D7C2794AA </sup></sub>|

### Hex Response Codes

Server API Endpoints respond immediately with a hex code indicating whether or not the request is valid. For subscription requests, data (if available) follows after a min. 50ms delay. 

| Name | Value | -                | Name | Value |
|------|-------|------------------|------|-------|
|INVALID_JSON_IN_REQUEST|0x02|-   |INVALID_SESSION_ID|0x0E|
|INVALID_TX_HASH|0x07|-           |INVALID_CALL_DATA|0x11|
|INVALID_PIN|0x09|-               |SESSION_NOT_FOUND|0x10|
|INVALID_TX_SENDER_ADDRESS|0x0A|- |TX_PENDING|0x0F|
|INVALID_TX_SIGNATURE|0x0B|-      |NO_SIGNED_MSG_IN_REQUEST|0x03| 
|INSUFFICIENT_GAS|0x0C|-          |NO_TX_DB_ERR|0x04|
|INSUFFICIENT_BALANCE|0x0D|-      |NO_TX_ADDR_ERR|0x05|
|NO_ETHEREUM|0x08|-               |RESULT_SUCCESS|0x00|



### Other code documentation

[Web3 interface methods](https://github.com/animist-io/whale-island/blob/master/docs/eth.md)

[Utility methods (request parsers, etc)](https://github.com/animist-io/whale-island/blob/master/docs/util.md)






-------------------


# BluetoothLE Server Endpoints 



