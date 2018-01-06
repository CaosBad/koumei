let bignum = require('bignumber')
let ByteBuffer = require('bytebuffer')
let constants = require('../lib/constants')

const MARKET_STATE = constants.MARKET_STATE

module.exports = {
  createMarket: async function (title, image, desc, results, currency, margin, share, endHeight) {
    // validate(currency, is currency)
    app.validate('string', title, {length: { minimum: 5, maximum: 256 }})
    app.validate('string', image, {length: { minimum: 15, maximum: 256 }})
    app.validate('string', image, {url: { schemes: ["http", "https"] }})
    app.validate('string', desc, {length: { minimum: 1000, maximum: 4096 }})
    app.validate('string', margin, {number: {greaterThanOrEqualTo: 10 * Math.pow(10, constants.MAX_DIGITS_PRECISION)}})
    app.validate('string', share, {number: {onlyInteger: true, greaterThan: 0, lessThanOrEqualTo: 10000}})
    let balance = app.balances.get(this.trs.senderId, currency)
    if (balance.lt(margin)) return 'Insufficient balance'

    results = results.split(',')
    app.validate('array', results, {length: {minimum: 2, maximum: 32}})
    resultsSet = new Set(results)
    if (results.length !== resultsSet.size) return 'There are repetitive answers'
    # let total = bignum(margin).mul(Math.log(results.length).toFixed(constants.MAX_DIGITS_PRECISION)).floor().toString()
    let total = margin
    let mid = app.autoID.increment('market_max_id')
    app.sdb.create('Market', {
      id: mid,
      tid: this.trs.id,
      initiator: this.trs.senderId,
      timestamp: this.trs.timestamp,
      title: title,
      image: image,
      desc: desc,
      results: results.length,
      currency: currency,
      margin: margin,
      share: share,
      endHeight: endHeight,
      total: total,
      state: MARKET_STATE.ONGOING,
      revealChoice: -1,
      verdictChoice: -1
    })
    for (let i in results) {
      app.sdb.create('Result', {
        mid: mid,
        choice: i,
        desc: results[i],
        share: 0
      })
    }
    app.balances.decrease(this.trs.senderId, currency, margin)
  },
  trade: async function (mid, share, choice) {
    let market = await app.model.Market.findOne({ condition: { id: mid } })
    if (!market) return 'Market not found'
    if (market.state > MARKET_STATE.ONGOING) return 'Trade already closed'

    let shareCond = { mid: mid, address: this.trs.senderId, choice: choice }
    let shareItem = app.sdb.get('Share', shareCond)
    if (share < 0 && (!shareItem || shareItem.share < -share)) {
      return 'Insufficient share'
    }

    let results = await app.model.Result.findAll({ condition: { mid: mid } })
    let v1 = 0
    let v2 = 0
    for (let i of results) {
      let choiceItem = app.sdb.get('Result', { mid: mid, choice: i.choice })
      let choiceShare = choiceItem.share
      v1 += Math.exp(choiceShare / market.share)
      if (i.choice === choice) {
        v2 += Math.exp((choiceShare + share) / market.share)
      } else {
        v2 += Math.exp(choiceShare / market.share)
      }
    }
    let c1 = bignum(market.margin).mul(Math.log(v1).toFixed(constants.MAX_DIGITS_PRECISION))
    let c2 = bignum(market.margin).mul(Math.log(v2).toFixed(constants.MAX_DIGITS_PRECISION))
    let amount = bignum(c2).sub(c1).floor().toString()
    app.logger.debug('amount is ',amount)
    if (app.balances.get(this.trs.senderId, market.currency).lt(amount)) return 'Insufficient balance'

    app.sdb.create('Trade', {
      mid: mid,
      tid: this.trs.id,
      trader: this.trs.senderId,
      choice: choice,
      share: share,
      amount: amount
    })
    app.sdb.increment('Result', { share: share }, { mid: mid, choice: choice })

    if (!shareItem) {
      app.sdb.create('Share', {
        share: 0,
        mid: mid,
        address: this.trs.senderId,
        choice: choice
      })
    }
    app.sdb.increment('Share', { share: share }, shareCond)
    app.sdb.increment('Market', { total: amount }, { id: mid })
    if (amount>0) {
      app.balances.decrease(this.trs.senderId, market.currency, amount)
    } else {
      app.balances.increase(this.trs.senderId, market.currency, Math.abs(amount))
    }
  },
  settle: async function (mid) {
    let senderId = this.trs.senderId
    let market = await app.model.Market.findOne({ condition: { id: mid } })
    if (!market) return 'Market not found'
    if (market.state < MARKET_STATE.FINISHED) return 'Market not finished'

    let correctChoice = market.verdictChoice >= 0 ? market.verdictChoice : market.revealChoice
    if (correctChoice < 0) return 'Invalid market state or final result'

    app.sdb.lock('settle@' + senderId + '_' + mid)
    let settleCond = { mid: mid, address: senderId }
    let dbSettle = await app.model.Settle.findOne({ condition: settleCond })
    if (dbSettle) return "Already had been settled in db"

    if (market.initiator !== senderId) {
      let myShares = await app.model.Share.findAll({ condition: { mid: mid, address: senderId } })
      for (let share of myShares) {
        let settledShare = share.share
        if (share.choice === correctChoice && settledShare > 0) {
          app.sdb.update('Share', { share: 0 }, { mid: mid, address: senderId, choice: share.choice })
          let amount = bignum(settledShare).mul(market.margin).div(market.share).floor().toString()
          app.sdb.create('Settle', {
            mid: mid,
            tid: this.trs.id,
            address: senderId,
            amount: amount,
            share: settledShare
          })
          app.balances.increase(senderId, market.currency, amount)
          return
        }
      }
      return 'No valid shares'
    } else {
      let results = await app.model.Result.findAll({ condition: { mid: mid } })
      let totalShares = 0
      for (let result of results) {
        if (result.choice === correctChoice) {
          totalShares = result.share
        }
      }
      let totalAmount = bignum(totalShares).mul(market.margin).div(market.share)
      let earning = bignum(market.total).sub(totalAmount).toString()
      app.sdb.create('Settle', {
        mid: mid,
        tid: this.trs.id,
        address: senderId,
        amount: earning,
        share: 0
      })
      app.balances.increase(senderId, market.currency, earning)
    }
  },
  reveal: async function (mid, choice) {
    let market = await app.model.Market.findOne({ condition: { id: mid } })
    if (!market) return 'Market not found'
    if (this.trs.senderId !== market.initiator) return 'Permission denied'
    if (this.block.height <= market.endHeight) return 'Time not arrived'
    // if (this.block.height > market.endHeight + app.config.revealBlockPeriod) return 'Out of date'
    if (market.state !== MARKET_STATE.REVEALING) return 'Incorrect market state'

    app.sdb.create('Reveal', {
      mid: mid,
      tid: this.trs.id,
      choice: choice,
      height: this.block.height
    })
    app.sdb.update('Market', { state: MARKET_STATE.ANNOUNCING }, { id: mid })
    app.sdb.update('Market', { revealHeight: this.block.height }, { id: mid })
    app.sdb.update('Market', { revealChoice: choice }, { id: mid })
  },
  appeal: async function (mid, content, amount) {
    let market = await app.model.Market.findOne({ condition: { id: mid } })
    if (!market) return 'Market not found'

    app.sdb.create('Appeal', {
      mid: mid,
      tid: this.trs.id,
      appealer: this.trs.senderId,
      content: content,
      amount: amount
    })
  },
  verdict: async function (mid, choice, signatures) {
    let market = await app.model.Market.findOne({ condition: { id: mid } })
    if (!market) return 'Market not found'
    if (market.state === MARKET_STATE.FINISHED) return 'Market is already finished'

    let buffer = new ByteBuffer(1, true)
    buffer.writeInt(1007)
    buffer.writeString(mid)
    buffer.writeInt(choice)
    buffer.flip()

    let keysigs = signatures.split(',')
    let publicKeys = []
    let sigs = []
    for (let ks of keysigs) {
      if (ks.length !== 192) return 'Invalid public key or signature'
      publicKeys.push(ks.substr(0, 64))
      sigs.push(ks.substr(64, 192))
    }
    let uniqPublicKeySet = new Set()
    for (let pk of publicKeys) {
      uniqPublicKeySet.add(pk)
    }
    if (uniqPublicKeySet.size !== publicKeys.length) return 'Duplicated public key'

    let sigCount = 0
    for (let i = 0; i < publicKeys.length; ++i) {
      let pk = publicKeys[i]
      let sig = sigs[i]
      if (app.meta.delegates.indexOf(pk) !== -1 && app.verifyBytes(buffer.toBuffer(), pk, sig)) {
        sigCount++
      }
    }
    if (sigCount < Math.floor(app.meta.delegates.length / 2) + 1) return 'Signatures not enough'

    app.sdb.create('Verdict', {
      mid: mid,
      tid: this.trs.id,
      choice: choice,
      signatures: signatures
    })
    app.sdb.update('Market', { state: MARKET_STATE.FINISHED }, { id: mid })
    app.sdb.update('Market', { verdictChoice: choice }, { id: mid })
  },
  comment: async function (mid, content) {
    let market = await app.model.Market.findOne({ condition: { id: mid } })
    if (!market) return 'Market not found'

    app.sdb.create('Comment', {
      mid: mid,
      tid: this.trs.id,
      authorId: this.trs.senderId,
      content: content,
    })
  },
  changeState: async function (mid, state) {
    if (app.meta.delegates.indexOf(this.trs.senderPublicKey) === -1) return 'Permission denied'

    let market = await app.model.Market.findOne({ condition: { id: mid } })
    if (!market) return 'Market not found'

    if (state === MARKET_STATE.REVEALING) {
      if (market.state !== MARKET_STATE.ONGOING) return 'State not correct'
      if (this.block.height <= market.endHeight) return 'Time not arrived'
    } else if (state === MARKET_STATE.FINISHED) {
      if (market.state !== MARKET_STATE.ANNOUNCING) return 'State not correct'
      if (this.block.height <= market.revealHeight + app.config.announceBlockPeriod) return 'Time not arrived'
    } else {
      return 'Invalid state'
    }
    app.sdb.update('Market', { state: state }, { id: mid })
  }
}
