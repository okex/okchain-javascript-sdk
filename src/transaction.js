import * as crypto from "./crypto/"


/**
 * Transaction
 * @param {String} param.account_number
 * @param {String} param.chain_id
 * @param {Object} param.fee
 * @param {String} param.memo
 * @param {Object} param.msg
 * @param {String} param.sequence
 */
class Transaction {
  constructor(param) {
    this.account_number = param.account_number
    this.chain_id = param.chain_id
    this.fee = param.fee
    this.msgs = param.msg
    this.memo = param.memo
    this.sequence = param.sequence

  }


  /**
   * @param {string} privateKeyHex
   * @param {Object} msg
   * @return {Transaction}
   **/
  sign(privateKeyHex, msg) {
    const signMsg = {
      "account_number": this.account_number.toString(),
      "chain_id": this.chain_id,
      "fee": this.fee,
      "memo": this.memo,
      "msgs": msg,
      "sequence": this.sequence.toString(),
    }
    console.log("signmsg: ",JSON.stringify(signMsg))
    const jsonStr = JSON.stringify(signMsg)
    const signBytes = Buffer.from(jsonStr)
    const privateKey = Buffer.from(privateKeyHex, "hex")
    const signature = crypto.sign(signBytes.toString("hex"), privateKey)

    const pubKey = crypto.encodePubKeyToCompressedBuffer(crypto.getPubKeyFromPrivateKey(privateKey))
    this.signatures = [{
      pub_key: {
        type:"ethermint/PubKeyEthSecp256k1",
        value:pubKey},
      signature: signature,
    }]
    return this
  }

  /**
   * @param {string} mode
   * @return {Object}
   */
  serializeTransactionWithJson(mode){
    if(!this.signatures) {
      throw new Error("null signature")
    }

    const stdTx = {
      msg: this.msgs,
      signatures: this.signatures,
      memo: this.memo,
      fee: this.fee,
    }
    stdTx.signatures = stdTx.signatures.map((item) => {
      item.pub_key.value=item.pub_key.value.toString("base64")
      item.signature=item.signature.toString("base64")
      return item
    })
    return JSON.stringify({
      tx: stdTx,
      mode: mode,
    })
  }


}


export default Transaction
