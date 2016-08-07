'use strict'

// ----------------------------------- Imports -----------------------------------------

// Local
let config = require('../lib/config');
let ble = require('../lib/handlers');
let util = require('../lib/util');
let defs = require('../lib/characteristics');
let eth = require('../lib/eth');

// Mocks
const account = require('../test/mocks/wallet');
const transactions = require('../test/mocks/transaction');

// Ethereum 
const Web3 = require('web3');
const ethjs_util = require("ethereumjs-util");
const wallet = require('eth-lightwallet');

// Misc NPM
const Promise = require('bluebird');
const pouchdb = require('pouchdb');
const bufferEqual = require('buffer-equal');

// Testing
const chai = require('chai');
const spies = require('chai-spies');
const chaiAsPromised = require("chai-as-promised");

// ----------------------------------- Setup -----------------------------------------
const expect = chai.expect;
const should = chai.should;
chai.use(spies);
chai.use(chaiAsPromised);

const provider = new Web3.providers.HttpProvider('http://localhost:8545');
const web3 = new Web3(provider);

// ----------------------------------- Tests -----------------------------------------

describe('BLE Request Handlers', () => {

    var db, keystore, address, hexAddress, deployed, goodTx, badTx, mismatchTx, callGetVerified;
    var client = web3.eth.accounts[0];

    before(() => {

        // Prep an eth-lightwallet keystore/account for pin signing tests
        let json = JSON.stringify(account.keystore);
        keystore = wallet.keystore.deserialize(json);  
        keystore.generateNewAddress(account.key, 1);
        address = keystore.getAddresses()[0];    // Lightwallets addresses are not prefixed.
        hexAddress = '0x' + address;             // Eth's are prefixed - we recover them as this.

        // Deploy TestContract, compose some signed transactions for rawTx submission.
        return transactions.generate().then( mock => {   

            deployed = mock.deployed;                // TestContract.sol deployed to test-rpc                            
            goodTx = mock.goodTx;                    // raw: TestContract.set(2, {from: client})
            badTx = mock.badTx;                      // raw: goodTx but sent with 0 gas.
            mismatchTx = mock.mismatchTx;            // raw: goodTx signed with wrong key.
            callGetVerified = mock.callGetVerified;  // array vals: call getVerified
        });
    });

    // New server per test
    beforeEach(() => { 
        db = new pouchdb('sessions'); 
        util._units.setDB(db);
    });

    afterEach(()=>{ return db.destroy() });
        
    describe('onGetPin', () => {

      it('should respond w/ the current pin', () => {
        
        let fns = {};
        let codes = config.codes;
        let pin_to_buffer = new Buffer(util.getPin());
        fns.callback = (code, pin) => {};
        
        chai.spy.on(fns, 'callback');
        ble.onGetPin(null, fns.callback);

        expect(fns.callback).to.have.been.called.with(codes.RESULT_SUCCESS, pin_to_buffer);

      });
    });

    describe('onGetTxStatus', () => {

        let hash, input, fns = {}, updateValueCallback, accounts = web3.eth.accounts;
        
        beforeEach(() => {
            fns.callback = () => {};
            hash = web3.eth.sendTransaction({from: accounts[0], to: accounts[1], value: 100 });
            input = JSON.stringify(hash);
            
        });

        it('should respond w/ RESULT_SUCCESS', (done) => {

            fns.callback = (code) => { 
                expect(code).to.equal(config.codes.RESULT_SUCCESS);
            };

            updateValueCallback = val => { done() };
            defs.getTxStatusCharacteristic.updateValueCallback = updateValueCallback;
            ble.onGetTxStatus(input, null, null, fns.callback );

        });

        it( 'should send data about the queried tx', (done) => {
            
            let tx = web3.eth.getTransaction(hash);
            let res = {blockNumber: tx.blockNumber, nonce: tx.nonce, gas: tx.gas};
            let expected_send = new Buffer(JSON.stringify(res));

            updateValueCallback = (val) => {
                expect(bufferEqual(val, expected_send)).to.be.true;
                done();
            };
            defs.getTxStatusCharacteristic.updateValueCallback = updateValueCallback;
            ble.onGetTxStatus( input, null, null, fns.callback );
        });

        it('should respond with INVALID_TX_HASH if input is malformed', (done) => {
            let malformed = '0x000000000000000012345';
            let malformed_input = JSON.stringify(malformed);
            
            fns.callback = (code) => { 
                expect(code).to.equal(config.codes.INVALID_TX_HASH);
                done();
            };

            chai.spy.on(fns, 'callback');
            ble.onGetTxStatus(malformed_input, null, null, fns.callback );
        });

        it('should send "null" if unable to find tx', (done) => {
            let missing = '0xf087407379e66de3d69da365826272f7750e6c978f5c2d034296de168f500000';
            let missing_input = JSON.stringify(missing);
            let expected_send = new Buffer(JSON.stringify('null'));

            updateValueCallback = (val) => {
                expect(bufferEqual(val, expected_send)).to.be.true;
                done();
            };
            
            defs.getTxStatusCharacteristic.updateValueCallback = updateValueCallback;
            ble.onGetTxStatus(missing_input, null, null, fns.callback );
        });

    });

    describe('onGetNewSessionId', () => {

        let input, pin, signed, msgHash, fns = {}, updateValueCallback;
        
        beforeEach(() => {
            // Zero out previous write callback
            fns.callback = () => {};

            // Mock client signed pin (web3 style),
            pin = util.getPin();
            msgHash = ethjs_util.addHexPrefix(ethjs_util.sha3(pin).toString('hex'));
            signed =  web3.eth.sign(client, msgHash); 
            input = JSON.stringify(signed);
            
        });

        it('should respond w/ RESULT_SUCCESS', (done) => {

            fns.callback = (code) => { 
                expect(code).to.equal(config.codes.RESULT_SUCCESS);
            };

            updateValueCallback = val => { done() };
            defs.getNewSessionIdCharacteristic.updateValueCallback = updateValueCallback;
            ble.onGetNewSessionId(input, null, null, fns.callback );

        });

        it( 'should send sessionId data', (done) => {
            
            updateValueCallback = (val) => {
                let out = JSON.parse(val.toString());
                expect(out.sessionId).to.be.a('string');
                expect(out.sessionId.length).to.equal(10);
                expect(out.expires).to.be.a('number');
                done();
            };
            defs.getNewSessionIdCharacteristic.updateValueCallback = updateValueCallback;
            ble.onGetNewSessionId(input, null, null, fns.callback );
        });

        it('should respond with NO_SIGNED_MSG_IN_REQUEST if input is malformed', (done) => {
            let malformed = "dd5[w,r,0,,n,g";
            let malformed_input = JSON.stringify(malformed);
            
            fns.callback = (code) => { 
                expect(code).to.equal(config.codes.NO_SIGNED_MSG_IN_REQUEST);
                done();
            };

            chai.spy.on(fns, 'callback');
            ble.onGetNewSessionId(malformed_input, null, null, fns.callback );
        });

    });

    describe('onCallTx', function() {
        let cb, updateValueCallback, data, out;
        it('should respond with RESULT_SUCCESS', (done)=>{

            data = JSON.stringify(callGetVerified) 
            
            cb = (code) => expect(code).to.equal(config.codes.RESULT_SUCCESS);
            updateValueCallback = val => done();
            
            defs.callTxCharacteristic.updateValueCallback = updateValueCallback;
            ble.onCallTx(data, null, null, cb);
            
        });

        it('should send a hex string result', (done)=> {
            out = '0x0000000000000000000000000000000000000000000000000000000000000001';
            out = new Buffer(JSON.stringify(out));
            data = JSON.stringify(callGetVerified) 
            
            cb = (code) => {};
            updateValueCallback = val => { 
                expect(bufferEqual(val, out)).to.be.true;
                done();
            };
            defs.callTxCharacteristic.updateValueCallback = updateValueCallback;
            ble.onCallTx(data, null, null, cb);

        });

        it('should respond w/ error code if data does not parse correctly', (done)=>{
            data = JSON.stringify(['3948394893', 890823493 ]);
            
            cb = (code) => {
                expect(code).to.equal(config.codes.INVALID_CALL_DATA);
                done();
            }
    
            ble.onCallTx(data, null, null, cb);
        });
    })

    describe('onAuthTx', function(){

        let pin, signed, msgHash, input, eth_db, record, updateValueCallback, fns = {};
        
        // Debugging . . . duplicate recs getting stuck in db
        before( () => {
            eth_db = new pouchdb('contracts'); 
            return eth_db.destroy();
        })

        beforeEach( () => {

            // Zero out previous write callback
            fns.callback = () => {};

            // Mock client signed pin (web3 style),
            pin = util.getPin();
            msgHash = ethjs_util.addHexPrefix(ethjs_util.sha3(pin).toString('hex'));
            signed =  web3.eth.sign(client, msgHash); 
            input = JSON.stringify(signed);

            // Load contract record into contractsDB.
            eth_db = new pouchdb('contracts'); 
            eth.units.setDB(eth_db);
            record = { _id: client, authority: client, contractAddress: deployed.address };
            return eth_db.put(record);

        });

        // Cleanup
        afterEach( () => { return eth_db.destroy() });

        it('should respond w/ RESULT_SUCCESS', (done) => {

            fns.callback = (code) => { 
                expect(code).to.equal(config.codes.RESULT_SUCCESS);
            };

            updateValueCallback = val => { done() };
            defs.authTxCharacteristic.updateValueCallback = updateValueCallback;
            ble.onAuthTx(input, null, null, fns.callback );

        });

        it( 'should send the tx hash of the auth contract call', (done) => {
            
            fns.callback = () => {};

            // Check txHash form: Is buffer, right length, hex prefixed
            updateValueCallback = (val) => {
                expect(Buffer.isBuffer(val)).to.be.true;
                expect(val.length).to.equal(68)    
                expect(ethjs_util.isHexPrefixed(JSON.parse(val))).to.be.true;
                done();
            };
            defs.authTxCharacteristic.updateValueCallback = updateValueCallback;
            ble.onAuthTx( input, null, null, fns.callback );
        });

        it('should respond with NO_SIGNED_MSG_IN_REQUEST if input is malformed', (done) => {
            let malformed = "dd5[w,r,0,,n,g";
            let malformed_input = JSON.stringify(malformed);
            
            fns.callback = (code) => { 
                expect(code).to.equal(config.codes.NO_SIGNED_MSG_IN_REQUEST);
                done();
            };

            chai.spy.on(fns, 'callback');
            ble.onAuthTx(malformed_input, null, null, fns.callback );
        });

        it('should send "null" if unable to find tx', (done) => {
            
            // Expecting 'null'
            let expected_send = new Buffer(JSON.stringify('null'));
            
            // Mock good pin sign, non-existent client.
            let non_client = web3.eth.accounts[3];
            pin = util.getPin();
            msgHash = ethjs_util.addHexPrefix(ethjs_util.sha3(pin).toString('hex'));
            signed =  web3.eth.sign(non_client, msgHash); 
            input = JSON.stringify(signed);

            updateValueCallback = (val) => {
                expect(bufferEqual(val, expected_send)).to.be.true;
                done();
            };
            
            defs.authTxCharacteristic.updateValueCallback = updateValueCallback;
            ble.onAuthTx(input, null, null, fns.callback );
        });
    });

    describe('onAuthAndSendTx', ()=> {

        let data, record, output, pin, msgHash, signed, eth_db;

        beforeEach(()=>{

            // Mock client signed pin (web3 style),
            pin = util.getPin();
            msgHash = ethjs_util.addHexPrefix(ethjs_util.sha3(pin).toString('hex'));
            signed =  web3.eth.sign(client, msgHash); 

            eth_db = new pouchdb('contracts'); 
            eth.units.setDB(eth_db);
            record = { _id: client, authority: client, contractAddress: deployed.address };
            return eth_db.put(record);
    
        });

        // Cleanup
        afterEach( () => { return eth_db.destroy() });

        it('should respond w/ RESULT_SUCCESS if pin and tx parse ok', (done)=>{
            data = JSON.stringify({pin: signed, tx: goodTx});
            
            let cb = (val) => {
                expect(val).to.equal(config.codes.RESULT_SUCCESS);
            } 
            let updateValueCallback = (sent) => { done(); };
            defs.authAndSendTxCharacteristic.updateValueCallback = updateValueCallback;
            ble.onAuthAndSendTx(data, null, null, cb);
        });

        it('should send the tx hash of the verifyPresence method call', (done)=>{

            data = JSON.stringify({pin: signed, tx: goodTx});
            
            let cb = (val) => {};

            // Check txHash form: Is buffer, right length, hex prefixed
            let updateValueCallback = (val) => {
                expect(Buffer.isBuffer(val)).to.be.true;
                expect(val.length).to.equal(68)    
                expect(ethjs_util.isHexPrefixed(JSON.parse(val))).to.be.true;
                done();
            };
            defs.authAndSendTxCharacteristic.updateValueCallback = updateValueCallback;    
            ble.onAuthAndSendTx(data, null, null, cb);
        });

        it('should call sendTxWhenAuthed', (done)=>{

            data = JSON.stringify({pin: signed, tx: goodTx});
            
            let cb = (val) => {};
            chai.spy.on(eth, 'sendTxWhenAuthed');

            let updateValueCallback = (sent) => {
                expect(eth.sendTxWhenAuthed).to.have.been.called();
                done();
            }
            defs.authAndSendTxCharacteristic.updateValueCallback = updateValueCallback;    
            ble.onAuthAndSendTx(data, null, null, cb);
        });

        it('should respond w/error if sent pin is bad', (done)=>{
            "dd5[w,r,0,,n,g"
            data = JSON.stringify({pin: "dd5[w,r,0,,n,g", tx: badTx});

            let cb = (val) => {
                expect(val).to.equal(config.codes.NO_SIGNED_MSG_IN_REQUEST);
                done();
            }    
            ble.onAuthAndSendTx(data, null, null, cb);
        });

        it('should respond w/error if sent tx is bad', (done)=> {

            data = JSON.stringify({pin: signed, tx: badTx});
            
            let cb = (val) => {
                expect(val).to.equal(config.codes.INSUFFICIENT_GAS);
                done();
            }    
            ble.onAuthAndSendTx(data, null, null, cb);
        });

    });

    describe('onSendTx', ()=>{

        let db, eth_db, cb, data, expected, orig_session, mock_auth_request;

        // Session DBs are opened and destroyed at the top of 'Request Handlers'
        // Debug - theres a contract left in the DB somewhere before this test
        before( () => {
            eth_db = new pouchdb('contracts'); 
            eth.units.setDB(eth_db);
            db = new pouchdb('sessions'); 
            return db.destroy().then(() => { return eth_db.destroy() })
        })
            
        it('should respond w/ RESULT_SUCCESS if sent data ok', (done)=>{
            orig_session = {account: client};
            cb = (val) => {
                expect(val).to.equal(config.codes.RESULT_SUCCESS);
            }
            let updateValueCallback = (sent) => { done() };
            defs.sendTxCharacteristic.updateValueCallback = updateValueCallback;
            
            util.startSession(orig_session).then( doc => {
                data = JSON.stringify({id: doc.sessionId, tx: goodTx});
                ble.onSendTx(data, null, null, cb);
            })
        });

        it('should send txHash of the sent transaction', (done)=>{
            orig_session = {account: client};
            cb = (val) => {};

            // Check for hash form
            let updateValueCallback = (val) => {
                expect(Buffer.isBuffer(val)).to.be.true;
                expect(val.length).to.equal(68)    
                expect(ethjs_util.isHexPrefixed(JSON.parse(val))).to.be.true;
                done();  
            };
            defs.sendTxCharacteristic.updateValueCallback = updateValueCallback;
            
            util.startSession(orig_session).then( doc => {
                data = JSON.stringify({id: doc.sessionId, tx: goodTx});
                ble.onSendTx(data, null, null, cb);
            })
        });

        it('should respond with error code if caller cant send a tx', (done)=>{
            orig_session = {account: web3.eth.accounts[2]};
            cb = (val) => {
                expect(val).to.equal(config.codes.INVALID_TX_SENDER_ADDRESS);
                done();
            }
            let updateValueCallback = (sent) => {};
            defs.sendTxCharacteristic.updateValueCallback = updateValueCallback;
            
            util.startSession(orig_session).then( doc => {
                data = JSON.stringify({id: doc.sessionId, tx: goodTx});
                ble.onSendTx(data, null, null, cb);
            })
        })
    })

    describe('onGetVerifiedTxHash', () => {
        let pin, data, signed, msgHash, input, eth_db, mock_record, updateValueCallback, fns = {};
        
        // Debugging . . . duplicate recs getting stuck in db
        before( () => {
            eth_db = new pouchdb('contracts'); 
            return eth_db.destroy();
        } )

        beforeEach( () => {

            // Zero out previous write callback
            fns.callback = () => {};

            // Mock client signed pin (web3 style),
            pin = util.getPin();
            msgHash = ethjs_util.addHexPrefix(ethjs_util.sha3(pin).toString('hex'));
            signed =  web3.eth.sign(client, msgHash); 
            input = JSON.stringify(signed);

            // Load contract record into contractsDB.
            eth_db = new pouchdb('contracts'); 
            eth.units.setDB(eth_db);

        });

        // Cleanup
        afterEach( () => { return eth_db.destroy() });

        it('should respond w/ RESULT_SUCCESS', (done) => {

            let cb = (code) => { 
                expect(code).to.equal(config.codes.RESULT_SUCCESS);
            };

            updateValueCallback = val => { done() };
            defs.getVerifiedTxHashCharacteristic.updateValueCallback = updateValueCallback;
            ble.onGetVerifiedTxHash(input, null, null, cb );

        });

        it('should send authStatus, authTxHash & verifiedTxHash data', (done)=>{
            mock_record = { 
                _id: client, 
                contractAddress: deployed.address,
                authStatus: 'pending', 
                authTxHash: '0x00001', 
                verifiedTxHash: null 
            };

            let cb = (code) => {};

            updateValueCallback = val => { 
                expect(Buffer.isBuffer(val)).to.be.true;
                val = JSON.parse(val);    
                expect(val.authStatus).to.equal('pending');
                expect(val.authTxHash).to.equal('0x00001');
                expect(val.verifiedTxHash).to.equal(null);
                done();
            };

            defs.getVerifiedTxHashCharacteristic.updateValueCallback = updateValueCallback;
            eth_db.put(mock_record).then( res => ble.onGetVerifiedTxHash(input, null, null, cb));


        });

        it('should behave as expected: e2e', (done)=>{
            
            // Fast mine authAndSendTx
            let original_mining = config.MINING_CHECK_INTERVAL;
            eth.units.setMiningCheckInterval(10); // Fast!

            data = JSON.stringify({pin: signed, tx: goodTx});
            
            // Check getVerifiedTxHash val after +1 sec.
            let cb = (val) => {};
            let updateValueCallback = (val) => {
                expect(Buffer.isBuffer(val)).to.be.true;
                val = JSON.parse(val);    
                expect(val.authStatus).to.equal('success');
                expect(val.authTxHash.length).to.equal(66);
                expect(val.verifiedTxHash.length).to.equal(66);
                eth.units.setMiningCheckInterval(original_mining);
                done();
            };
        
            // Wait for simulated authAndSendTx call to (probably) finish
            setTimeout(()=>{
                ble.onGetVerifiedTxHash(input, null, null, cb);
            }, 1000)

            // Simulate an authAndSendTx call.
            defs.getVerifiedTxHashCharacteristic.updateValueCallback = updateValueCallback;
            defs.authAndSendTxCharacteristic.updateValueCallback = () => {};    
            mock_record = { _id: client, authority: client, contractAddress: deployed.address };
            eth_db.put(mock_record).then( res => ble.onAuthAndSendTx(data, null, null, cb));  
        });

        it('should send "null" if it cant find the contract record', (done)=>{
            let expected_send = new Buffer(JSON.stringify('null'));

            mock_record = { 
                _id: 'not_the_id_you_need', 
                contractAddress: deployed.address,
                authStatus: 'pending', 
                authTxHash: '0x00001', 
                verifiedTxHash: null 
            };

            let cb = (code) => {};
            updateValueCallback = (val) => {
                expect(bufferEqual(val, expected_send)).to.be.true;
                done();
            };

            defs.getVerifiedTxHashCharacteristic.updateValueCallback = updateValueCallback;
            eth_db.put(mock_record).then( res => ble.onGetVerifiedTxHash(input, null, null, cb));
        });

        it('should respond w/ error code if pin signature doesnt parse', (done)=>{

            let data = JSON.stringify("dd5[w,r,0,,n,g");
            let cb = (val) => {
                expect(val).to.equal(config.codes.NO_SIGNED_MSG_IN_REQUEST);
                done();
            }    
            ble.onAuthAndSendTx(data, null, null, cb);
        });
    });

    describe('onGetBlockNumber', ()=> {

        let callback, valString, valInt;

        it('should respond w/RESULT_SUCCESS & the current blockNumber', (done) => {
            let callback = (code, val) => {
                
                // Decode val
                valString = JSON.parse(val.toString());
                valInt = parseInt(valString);
                
                expect(code).to.equal(config.codes.RESULT_SUCCESS);
                expect(valInt).to.equal(web3.eth.blockNumber);
                done();
            }

            ble.onGetBlockNumber(null, callback);
        });    
    });

    describe('onGetContract', () => {
        
        let req, eth_db, mock_contract, fns = {};

        // Mocks
        before(()=>{
            
            req = wallet.signing.signMsg( keystore, account.key, util.getPin(), address); 
            req = JSON.stringify(req);

            mock_contract = { _id: hexAddress, authority: hexAddress, contractAddress: deployed.address };
            
        });

        // Clear state, set a contract to find,  & mock updateValueCallback
        beforeEach((done)=>{

            eth_db = new pouchdb('contracts'); 
            eth.units.setDB(eth_db);

            util._units.resetSendQueue();
            defs.getContractCharacteristic.updateValueCallback = (val) => {};
            fns.callback = (code) => {}; 

            eth_db.put(mock_contract).then(() => {
                done();
            });
        });

        afterEach((done)=>{ 
            eth_db.destroy().then(() => { done() });
        }); 

        it('should respond w/ RESULT_SUCCESS if a tx matching the address is found', (done)=>{

            // Test state in success callback - make sure you run the timeout too
            // or it will f the subsequent tests
            fns.callback = (code) => { 
                expect(code).to.equal(config.codes.RESULT_SUCCESS);
                setTimeout(done, 55); 
            };
            ble.onGetContract(req, null, null, fns.callback);
            
        });

        it('should push the tx into the send queue', (done) => {

            let initial_queue_size, new_queue_size;

            initial_queue_size = util._units.getSendQueue().length;
            
            // Test state in success callback - make sure you run the timeout too
            // or it will f the subsequent tests
            fns.callback = (code) => { 
                expect(code).to.equal(config.codes.RESULT_SUCCESS);
                new_queue_size = util._units.getSendQueue().length;
                expect(initial_queue_size).to.equal(0);
                expect(new_queue_size).to.be.gt(0);
                setTimeout(done, 55); 
            };
        
            // Run fn
            ble.onGetContract(req, null, null, fns.callback)
    
        });

        it('should begin writing/processing the send queue', (done) => {

            let tx, full_queue, full_queue_size, new_queue_size, expected_queue_size;
            
            // Clean up
            util._units.resetSendQueue();
        
            // Test post callback . . . in a timeout.
            fns.callback = (code) => { 

                full_queue = util._units.getSendQueue();
                full_queue_size = full_queue.length;
        
                chai.spy.on(defs.getContractCharacteristic, 'updateValueCallback');

                setTimeout(() => {
                    new_queue_size = util._units.getSendQueue().length;
                    expect(code).to.equal(config.codes.RESULT_SUCCESS);
                    expect(defs.getContractCharacteristic.updateValueCallback).to.have.been.called();
                    expect(new_queue_size).to.equal(full_queue_size - 1);
                    done();
                }, 55);
            };

            // Run
            ble.onGetContract(req, null, null, fns.callback);
            
        });

        it('should respond w/ NO_TX_DB_ERR if there is no tx matching the address', (done)=>{
            
            // Setup: delete mock from contracts DB
            eth_db.get(hexAddress)
                .then( doc => { return eth_db.remove(doc) })
                .then( () => {
                    chai.spy.on(fns, 'callback');
                    setTimeout(() => {
                        expect(fns.callback).to.have.been.called.with(config.codes.NO_TX_DB_ERR);
                        done();
                    }, 55)
                    ble.onGetContract(req, null, null, fns.callback);
                 })
        });

        it('should respond w/ error code if req is un-parseable', ()=>{

            req = "dd5[w,r,0,,n,g";
            chai.spy.on(fns, 'callback');

            ble.onGetContract(req, null, null, fns.callback);
            expect(fns.callback).to.have.been.called.with(config.codes.INVALID_JSON_IN_REQUEST);
            
        });

    });

    describe('onGetContractIndicate', ()=>{
        var req, fns = {};


        // Run getContractWrite: Clear state & mock updateValueCallback
        beforeEach(() =>{

            util._units.resetSendQueue();
            defs.getContractCharacteristic.updateValueCallback = (val) => {};
            util.queueContract(config.fakeTx);

        });

        it('should de-queue & send the next packet', (done)=>{
            
            let queue = util._units.getSendQueue();
            let initial_queue_size = queue.length;
            let initial_queue_element = queue[0];

            chai.spy.on(defs.getContractCharacteristic, 'updateValueCallback');
            ble.onGetContractIndicate();

            setTimeout(()=>{
                queue = util._units.getSendQueue();
                expect(defs.getContractCharacteristic.updateValueCallback).to.have.been.called.with(initial_queue_element);
                expect(queue.length).to.equal(initial_queue_size - 1);
                done();
            },0);

        });

        it('should send EOF signal if queue is empty', (done)=>{

            let expected = new Buffer(config.codes.EOF);
            chai.spy.on(defs.getContractCharacteristic, 'updateValueCallback');

            util._units.resetSendQueue();
            ble.onGetContractIndicate();

            setTimeout(()=>{
                expect(defs.getContractCharacteristic.updateValueCallback).to.have.been.called.with(expected);
                done();
            },10);

        });

        it('should do nothing post-EOF', (done)=>{

            // Run EOF
            util._units.resetSendQueue();
            ble.onGetContractIndicate();

            setTimeout(()=>{
                
                // Post EOF
                chai.spy.on(defs.getContractCharacteristic, 'updateValueCallback');
                ble.onGetContractIndicate();

                setTimeout(() =>{
                    expect(defs.getContractCharacteristic.updateValueCallback).not.to.have.been.called();
                    done();
                 },0)
            },0);
        });
    });
});