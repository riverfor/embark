const async = require('async');
const AccountParser = require('../../utils/accountParser');
const fundAccount = require('./fundAccount');

class Provider {
  constructor(options) {
    this.web3 = options.web3;
    this.accountsConfig = options.accountsConfig;
    this.blockchainConfig = options.blockchainConfig;
    this.type = options.type;
    this.web3Endpoint = options.web3Endpoint;
    this.logger = options.logger;
    this.isDev = options.isDev;
  }

  startWeb3Provider(callback) {
    const self = this;

    if (this.type === 'rpc') {
      self.provider = new this.web3.providers.HttpProvider(self.web3Endpoint);
    } else if (this.type === 'ws') {
      self.provider = new this.web3.providers.WebsocketProvider(self.web3Endpoint, {headers: {Origin: "embark"}});
      self.provider.on('error', e => self.logger.error('Websocket Error', e));
      self.provider.on('end', e => self.logger.error('Websocket connection ended', e));
    } else {
      return callback(__("contracts config error: unknown deployment type %s", this.type));
    }

    self.web3.setProvider(self.provider);

    self.web3.eth.getAccounts((err, accounts) => {
      if (err) {
        self.logger.warn('Error while getting the node\'s accounts.', err.message || err);
      }

      self.accounts = AccountParser.parseAccountsConfig(self.accountsConfig, self.web3, self.logger, accounts);
      self.addresses = [];

      if (!self.accounts.length) {
        return callback();
      }

      self.accounts.forEach(account => {
        self.addresses.push(account.address);
        if (account.privateKey) {
          self.web3.eth.accounts.wallet.add(account);
        }
      });
      self.web3.eth.defaultAccount = self.addresses[0];
      console.dir(self.addresses);

      const realSend = self.provider.send.bind(self.provider);
      self.provider.send = function (payload, cb) {
        if (payload.method === 'eth_accounts') {
          return realSend(payload, function (err, result) {
            if (err) {
              return cb(err);
            }
            result.result = self.addresses; // Send our addresses
            cb(null, result);
          });
        }
        realSend(payload, cb);
      };

      callback();
    });
  }

  stop() {
    if (this.provider && this.provider.removeAllListeners) {
      this.provider.removeAllListeners('connect');
      this.provider.removeAllListeners('error');
      this.provider.removeAllListeners('end');
      this.provider.removeAllListeners('data');
      this.provider.responseCallbacks = {};
      this.provider = null;
    }
  }

  fundAccounts(callback) {
    const self = this;
    if (!self.accounts.length) {
      return callback();
    }
    if (!self.isDev) {
      return callback();
    }
    async.eachLimit(self.accounts, 1, (account, eachCb) => {
      fundAccount(self.web3, account.address, account.hexBalance, eachCb);
    }, callback);
  }
}

module.exports = Provider;
