/**
 * @jest-environment node
 */
/**
 * @module client
 */
import * as crypto from "./crypto"
import Transaction from "./transaction"
import HttpProxy from "./httpProxy"
import * as wallet from './wallet'

const defaultChainId = "exchain-66"
const defaultRelativePath = "/okexchain/v1"
const mode = "block"
const nativeDenom = "okt"
const defaultTestnetFee = {
    amount: [{
        amount: "0.000020000000000000",
        denom: nativeDenom,

    }],
    gas: "200000",
}
const defaultMainnetFee = {
    amount: [{
        amount: "0.000020000000000000",
        denom: nativeDenom,

    }],
    gas: "200000",
}
var defaultFee = defaultMainnetFee
const precision = 18


export const GetClient = async (privateKey, url) => {
    const client = new OKEXChainClient(url)
    client.setAccountInfo(privateKey)
    return client
}

/**
 * The OKEXChain client.
 */
export class OKEXChainClient {
    /**
     * @param {string} url
     * @param {Object} config
     * {
     *     chainId: "exchain-66" (mainnet, default) / "exchain-65" (testnet)
     *     relativePath: "/exchain/v1" (mainnet, default) / "/exchain-test/v1" (testnet)
     *     isMainnet: true (mainnet) / false (other, default)
     *     signer: external signer object, Object / null (default)
     * }
     */
    constructor(url, config) {
        if (!url) {
            throw new Error("null url")
        }
        this.httpClient = new HttpProxy(url)
        this.mode = mode
        this.chainId = (config && config.chainId) || defaultChainId
        this.PostUrl = ((config && config.relativePath) || defaultRelativePath) + "/txs"
        this.queryAccountUrl = ((config && config.relativePath) || defaultRelativePath) + "/auth/accounts"
        this.isMainnet = (config && config.isMainnet) || false
        this.signer = (config && config.signer) || null

        if (this.isMainnet) {
            defaultFee = defaultMainnetFee
        } else {
            defaultFee = defaultTestnetFee
        }
    }

    /**
     * set the mode when send transaction
     * @param {string} mode block|sync|async
     */
    async setMode(m) {
        this.mode = m
    }

    /**
     * set the chainId when send transaction
     * @param {string} id
     */
    async setChainId(id) {
        this.chainId = id
    }

    /**
     * set the address
     * @param {string} address
     */
    async setAddress(address) {
        if (address !== this.address) {
            this.address = address;
            const data = await this.getAccount(address);
            this.account_number = this.getAccountNumberFromAccountInfo(data);
        }

        return this
    }

    /**
     * @param {string} privateKey
     * @param {string} prefix
     * @return {OKEXChainClient}
     */
    async setAccountInfo(privateKey, prefix = "ex") {
        if(!privateKey) {
            const address = await wallet.getAddress();
            if (!address) throw new Error("invalid privateKey: " + privateKey)
            await this.setAccountInfoByWallet(address);
            return this;
        }
        if (privateKey !== this.privateKey) {
            const address = crypto.getAddressFromPrivateKey(privateKey, prefix)
            if (!address) throw new Error("invalid privateKey: " + privateKey)
            if (address === this.address) return this
            this.privateKey = privateKey
            this.address = address
            const data = await this.getAccount(address)
            this.account_number = this.getAccountNumberFromAccountInfo(data)
        }
        return this
    }

    /**
     * @return {OKEXChainClient}
     */
    async setAccountInfoByWallet(address) {
        if (!address) throw new Error("invalid wallet connect address: " + address);
        if (address === this.address) return this
        this.address = address
        const data = await this.getAccount(address)
        this.account_number = this.getAccountNumberFromAccountInfo(data)
        return this
    }

    /**
     * Send SendTransaction.
     * @param {String} to To Address
     * @param {Number} amount Coin Quantity
     * @param {String} denom Coin Name
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */

    async sendSendTransaction(to, amount, denom, memo = "", sequenceNumber = null) {

        if (to.slice(0, 2) === '0x') {
            to = crypto.encodeAddressToBech32(to)
        }

        const coin = {
            amount: this.formatNumber(amount),
            denom: denom,

        }

        const msg = [{
            type: "okexchain/token/MsgTransfer",
            value: {
                amount: [coin],
                from_address: this.address,
                to_address: to,
            },
        }]

        const signMsg = msg


        const signedTx = await this.buildTransaction(msg, signMsg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /**
     * Send CancelOrderTransaction.
     * @param {String} orderId
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */

    async sendCancelOrderTransaction(orderId, memo = "", sequenceNumber = null) {
        var orderIdList = [orderId]
        return this.sendCancelOrdersTransaction(orderIdList, memo, sequenceNumber)
    }

    async sendCancelOrdersTransaction(orderIdList, memo = "", sequenceNumber = null) {
        var msg = []
        var signMsg = []

        msg.push({
            type: "okexchain/order/MsgCancel",
            value: {
                order_ids: orderIdList,
                sender: this.address,
            },
        })
        signMsg = msg

        const signedTx = await this.buildTransaction(msg, signMsg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /*
     * format number
     */
    formatNumber(num) {
        let str = String(num);
        let retStr = '';
        if (str.indexOf('.') >= 0) {
            if (str.split('.')[1].length > precision) {
                throw new Error("The actual received decimal precision is " + str.split('.')[1].length + ", and the expected is " + precision);
            } else if (str.split('.')[1].length == precision) {
                retStr = str
            } else {
                let appendix = '';
                const len = precision - str.split('.')[1].length;
                for (let i = 0; i < len; i++) {
                    appendix += '0';
                }
                retStr = str + appendix;
            }
        } else {
            retStr += `${str}.000000000000000000`;
        }
        return retStr;
    };

    /**
     * Send PlaceOrderTransaction.
     * @param {String} product
     * @param {String} side
     * @param {Number} price
     * @param {Number} quantity
     * @param {Number} memo
     * @param {Number} sequence
     * @return {Object} response
     */
    async sendPlaceOrderTransaction(product, side, price, quantity, memo = "", sequence = null) {
        var order_items = [{
            price: this.formatNumber(price),
            product: product,
            quantity: this.formatNumber(quantity),
            side: side,
        }]
        return this.sendPlaceOrdersTransaction(order_items, memo, sequence)
    }

    async sendPlaceOrdersTransaction(order_items, memo = "", sequence = null) {
        const placeOrderMsg = [{
            type: "okexchain/order/MsgNew",
            value: {
                order_items: order_items,
                sender: this.address,
            },

        }]
        const signMsg = placeOrderMsg


        const signedTx = await this.buildTransaction(placeOrderMsg, signMsg, memo, defaultFee, sequence)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /**
     * Build Transaction for sending to okexchain.
     * @param {Object} msg
     * @param {Object} signMsg
     * @param {String} memo
     * @param {String} fee
     * @param {Number} sequenceNumber
     * @return {Transaction} Transaction object
     */
    async buildTransaction(msg, signMsg, memo = "", fee = null, sequenceNumber = null) {
        if (!sequenceNumber) {
            const accountInfo = await this.getAccount()
            sequenceNumber = this.getSequenceNumberFromAccountInfo(accountInfo)
            this.account_number = this.getAccountNumberFromAccountInfo(accountInfo)
        }

        const params = {
            account_number: parseInt(this.account_number),
            chain_id: this.chainId,
            memo: memo,
            msg,
            sequence: sequenceNumber,
            fee: fee,
        }

        const tx = new Transaction(params)

        if (this.signer) {
            return await tx.sign(this.signer, signMsg, this.address);
        }
        else {
            return this.privateKey ? tx.sign(this.privateKey, signMsg) : tx.signByWallet(signMsg)
        }
    }

    /**
     * send transaction to OKEXChain.
     * @param {signedTx} tx signed Transaction object
     * @param {Boolean} mode use synchronous mode, optional
     * @return {Object} response (success or fail)
     */
    async sendTransaction(signedTx) {
        const buf = signedTx.serializeTransactionWithJson(this.mode)
        console.log(buf)
        const opts = {
            data: buf,
            headers: {
                "content-type": "text/plain",
            }
        }
        return this.httpClient.send("post", this.PostUrl, null, opts)
    }


    /**
     * get account
     * @param {String} address
     * @return {Object} result
     */
    async getAccount(address = this.address) {
        if (!address) {
            throw new Error("address should not be falsy")
        }
        try {
            const data = await this.httpClient.send("get", `${this.queryAccountUrl}/${address}`)
            return data
        } catch (err) {
            return null
        }
    }

    /**
     * get balances from OKEXChain
     * @param {String} address
     * @return {Object} result
     */
    async getBalance(address = this.address) {
        try {
            const data = await this.getAccount(address)
            return this.getBalanceFromAccountInfo(data)
        } catch (err) {
            return []
        }
    }

    /**
     * get balances from accountInfo Object
     * @param {Object} accountInfo optional address
     * @return {Object} result
     */
    async getBalanceFromAccountInfo(accountInfo) {
        return accountInfo.result.value.coins
    }

    /**
     * get SequenceNumber from OKEXChain
     * @param {String} address
     * @return {Number} sequenceNumber
     */
    async getSequenceNumber(address = this.address) {
        try {
            const data = await this.getAccount(address)
            return this.getSequenceNumberFromAccountInfo(data)
        } catch (err) {
            return null
        }
    }

    /**
     * get SequenceNumber from accountInfo Object
     * @param {String} accountInfo
     * @return {Number} sequenceNumber
     */
    getSequenceNumberFromAccountInfo(accountInfo) {
        return accountInfo.result.value.sequence
    }

    /**
     * get accountNumber from accountInfo Object
     * @param {String} accountInfo
     * @return {Number} accountNumber
     */
    getAccountNumberFromAccountInfo(accountInfo) {
        return accountInfo.result.value.account_number
    }


    /**
     * Send TokenIssueTransaction.
     * @param {String} symbol
     * @param {String} whole_name
     * @param {String} total_supply
     * @param {Boolean} mintable
     * @param {String} description
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */
    async sendTokenIssueTransaction(symbol, whole_name, total_supply, mintable = false, description = '', memo = '', sequenceNumber = null) {

        const msg = [{
            type: "okexchain/token/MsgIssue",
            value: {
                description: description,
                mintable: mintable,
                original_symbol: symbol,
                owner: this.address,
                symbol: symbol,
                total_supply: total_supply,
                whole_name: whole_name,
            }
        }]

        const signedTx = await this.buildTransaction(msg, msg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /**
     * Send TokenBurnTransaction.
     * @param {String} token
     * @param {String} amount
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */
    async sendTokenBurnTransaction(token, amount, memo = "", sequenceNumber = null) {

        const msg = [{
            type: "okexchain/token/MsgBurn",
            value: {
                amount: {
                    amount: this.formatNumber(amount),
                    denom: token
                },
                owner: this.address
            }
        }]

        const signedTx = await this.buildTransaction(msg, msg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /**
     * Send TokenMintTransaction.
     * @param {String} token
     * @param {String} amount
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */
    async sendTokenMintTransaction(token, amount, memo = "", sequenceNumber = null) {

        const msg = [{
            type: "okexchain/token/MsgMint",
            value: {
                amount: {
                    amount: this.formatNumber(amount),
                    denom: token
                },
                owner: this.address
            }
        }]

        const signedTx = await this.buildTransaction(msg, msg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /**
     * Send RegisterDexOperatorTransaction.
     * @param {String} website
     * @param {String} handling_fee_address
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */

    async sendRegisterDexOperatorTransaction(website, handling_fee_address, memo = "", sequenceNumber = null) {

        if (!crypto.validateAddress(handling_fee_address)) {
            throw new Error("invalid handling_fee_address")
        }
        const msg = [{
            type: "okexchain/dex/CreateOperator",
            value: {
                handling_fee_address: handling_fee_address,
                owner: this.address,
                website: website,
            },
        }]

        const signedTx = await this.buildTransaction(msg, msg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /**
     * Send ListTokenPairTransaction.
     * @param {String} base_asset
     * @param {String} quote_asset
     * @param {String} init_price
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */

    async sendListTokenPairTransaction(base_asset, quote_asset, init_price, memo = "", sequenceNumber = null) {

        const msg = [{
            type: "okexchain/dex/MsgList",
            value: {
                init_price: this.formatNumber(init_price),
                list_asset: base_asset,
                owner: this.address,
                quote_asset: quote_asset,
            },
        }]

        const signedTx = await this.buildTransaction(msg, msg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /**
     * Send AddProductDepositTransaction.
     * @param {String} amount
     * @param {String} product
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */

    async sendAddProductDepositTransaction(amount, product, memo = "", sequenceNumber = null) {

        const coin = {
            amount: this.formatNumber(amount),
            denom: nativeDenom,
        }

        const msg = [{
            type: "okexchain/dex/MsgDeposit",
            value: {
                amount: coin,
                depositor: this.address,
                product: product,
            },
        }]


        const signedTx = await this.buildTransaction(msg, msg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /**
     * Send WithdrawProductDepositTransaction.
     * @param {String} amount
     * @param {String} product
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */

    async sendWithdrawProductDepositTransaction(amount, product, memo = "", sequenceNumber = null) {

        const coin = {
            amount: this.formatNumber(amount),
            denom: nativeDenom,
        }

        const msg = [{
            type: "okexchain/dex/MsgWithdraw",
            value: {
                amount: coin,
                depositor: this.address,
                product: product,
            },
        }]


        const signedTx = await this.buildTransaction(msg, msg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /**
     * Send AddLiquidityTransaction.
     * @param {Number} min_liquidity
     * @param {Number} max_base_amount
     * @param {String} base_token
     * @param {Number} quote_amount
     * @param {String} quote_token
     * @param {String} deadline
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */
    async sendAddLiquidityTransaction(min_liquidity, max_base_amount, base_token, quote_amount, quote_token, deadline, memo = '', sequenceNumber = null) {

        const base_coin = {
            amount: this.formatNumber(max_base_amount),
            denom: base_token,
        }
        const quote_coin = {
            amount: this.formatNumber(quote_amount),
            denom: quote_token,
        }

        const msg = [{
            type: "okexchain/ammswap/MsgAddLiquidity",
            value: {
                deadline: deadline,
                max_base_amount: base_coin,
                min_liquidity: this.formatNumber(min_liquidity),
                quote_amount: quote_coin,
                sender: this.address,
            }
        }]

        const signedTx = await this.buildTransaction(msg, msg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /**
     * Send RemoveLiquidityTransaction.
     * @param {Number} liquidity
     * @param {Number} min_base_amount
     * @param {String} base_token
     * @param {Number} min_quote_amount
     * @param {String} quote_token
     * @param {String} deadline
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */
    async sendRemoveLiquidityTransaction(liquidity, min_base_amount, base_token, min_quote_amount, quote_token, deadline, memo = '', sequenceNumber = null) {

        const base_coin = {
            amount: this.formatNumber(min_base_amount),
            denom: base_token,
        }
        const quote_coin = {
            amount: this.formatNumber(min_quote_amount),
            denom: quote_token,
        }

        const msg = [{
            type: "okexchain/ammswap/MsgRemoveLiquidity",
            value: {
                deadline: deadline,
                liquidity: this.formatNumber(liquidity),
                min_base_amount: base_coin,
                min_quote_amount: quote_coin,
                sender: this.address,
            }
        }]

        const signedTx = await this.buildTransaction(msg, msg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /**
     * Send CreateExchangeTransaction.
     * @param {String} Token0Name
     * @param {String} Token1Name
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */
    async sendCreateExchangeTransaction(Token0Name, Token1Name, memo = '', sequenceNumber = null) {

        const msg = [{
            type: "okexchain/ammswap/MsgCreateExchange",
            value: {
                sender: this.address,
                token0_name: Token0Name,
                token1_name: Token1Name,
            }
        }]

        const signedTx = await this.buildTransaction(msg, msg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /**
     * Send SwapTokenTransaction.
     * @param {Number} sold_token_amount
     * @param {String} sold_token
     * @param {Number} min_bought_token_amount
     * @param {String} bought_token
     * @param {String} deadline
     * @param {String} recipient
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */
    async sendSwapTokenTransaction(sold_token_amount, sold_token, min_bought_token_amount, bought_token, deadline, recipient, memo = '', sequenceNumber = null) {

        const sold_coin = {
            amount: this.formatNumber(sold_token_amount),
            denom: sold_token,
        }
        const bought_coin = {
            amount: this.formatNumber(min_bought_token_amount),
            denom: bought_token,
        }

        const msg = [{
            type: "okexchain/ammswap/MsgSwapToken",
            value: {
                deadline: deadline,
                min_bought_token_amount: bought_coin,
                recipient: recipient,
                sender: this.address,
                sold_token_amount: sold_coin,
            }
        }]

        const signedTx = await this.buildTransaction(msg, msg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /**
     * Send FarmCreatePoolTransaction.
     * @param {String} pool_name
     * @param {String} min_lock_denom
     * @param {Number} min_lock_amount
     * @param {String} yield_symbol
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */
    async sendFarmCreatePoolTransaction(pool_name, min_lock_denom, min_lock_amount, yield_symbol, memo = '', sequenceNumber = null) {
        const min_lock_coin = {
            amount: this.formatNumber(min_lock_amount),
            denom: min_lock_denom,
        }
        const msg = [{
            type: "okexchain/farm/MsgCreatePool",
            value: {
                min_lock_amount: min_lock_coin,
                owner: this.address,
                pool_name: pool_name,
                yielded_symbol: yield_symbol,
            }
        }]

        const signedTx = await this.buildTransaction(msg, msg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /**
     * Send FarmDestroyPoolTransaction.
     * @param {String} pool_name
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */
    async sendFarmDestroyPoolTransaction(pool_name, memo = '', sequenceNumber = null) {
        const msg = [{
            type: "okexchain/farm/MsgDestroyPool",
            value: {
                owner: this.address,
                pool_name: pool_name,
            }
        }]

        const signedTx = await this.buildTransaction(msg, msg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /**
     * Send FarmProvideTransaction.
     * @param {String} pool_name
     * @param {String} provide_denom
     * @param {Number} provide_amount
     * @param {Number} yielded_per_block
     * @param {String} start_height
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */
    async sendFarmProvideTransaction(pool_name, provide_denom, provide_amount, yielded_per_block, start_height, memo = '', sequenceNumber = null) {
        const provide_coin = {
            amount: this.formatNumber(provide_amount),
            denom: provide_denom,
        }
        const msg = [{
            type: "okexchain/farm/MsgProvide",
            value: {
                address: this.address,
                amount: provide_coin,
                amount_yielded_per_block: this.formatNumber(yielded_per_block),
                pool_name: pool_name,
                start_height_to_yield: start_height,
            }
        }]

        const signedTx = await this.buildTransaction(msg, msg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /**
     * Send FarmLockTransaction.
     * @param {String} pool_name
     * @param {String} lock_denom
     * @param {Number} lock_amount
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */
    async sendFarmLockTransaction(pool_name, lock_denom, lock_amount, memo = '', sequenceNumber = null) {
        const amount = {
            amount: this.formatNumber(lock_amount),
            denom: lock_denom,
        }
        const msg = [{
            type: "okexchain/farm/MsgLock",
            value: {
                address: this.address,
                amount: amount,
                pool_name: pool_name,
            }
        }]

        const signedTx = await this.buildTransaction(msg, msg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /**
     * Send FarmUnLockTransaction.
     * @param {String} pool_name
     * @param {String} unlock_denom
     * @param {Number} unlock_amount
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */
    async sendFarmUnLockTransaction(pool_name, unlock_denom, unlock_amount, memo = '', sequenceNumber = null) {
        const amount = {
            amount: this.formatNumber(unlock_amount),
            denom: unlock_denom,
        }
        const msg = [{
            type: "okexchain/farm/MsgUnlock",
            value: {
                address: this.address,
                amount: amount,
                pool_name: pool_name,
            }
        }]

        const signedTx = await this.buildTransaction(msg, msg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

    /**
     * Send FarmClaimTransaction.
     * @param {String} pool_name
     * @param {String} memo
     * @param {Number} sequenceNumber
     * @return {Object} response
     */
    async sendFarmClaimTransaction(pool_name, memo = '', sequenceNumber = null) {
        const msg = [{
            type: "okexchain/farm/MsgClaim",
            value: {
                address: this.address,
                pool_name: pool_name,
            }
        }]

        const signedTx = await this.buildTransaction(msg, msg, memo, defaultFee, sequenceNumber)
        const res = await this.sendTransaction(signedTx)
        return res
    }

}
