let bignum = require('bignumber')
let constants = require('../lib/constants')

function isDefined(x) {
  return typeof x !== 'undefined'
}

app.route.get('/markets', async (req) => {
  let query = req.query
  let condition = {}
  if (isDefined(query.currency)) condition.currency = query.currency
  if (isDefined(query.initiator)) condition.initiator = query.initiator
  if (isDefined(query.state)) condition.state = query.state
  if (isDefined(query.tid)) condition.tid = query.tid

  let count = await app.model.Market.count(condition)
  let markets = []
  if (count > 0) {
    markets = await app.model.Market.findAll({
      condition: condition,
      sort: {
        endHeight: -1
      },
      limit: req.query.limit || 50,
      offset: req.query.offset || 0
    })
  }
  return { markets: markets, count: count }
})

app.route.get('/markets/:id', async (req) => {
  let market = await app.model.Market.findOne({ condition: { id: req.params.id } })
  if (!market) throw new Error('Market not found')
  let account = await app.model.Account.findOne({ condition: { address: market.initiator } })
  market.initiatorNickName = account.str1
  return { market: market }
})

app.route.get('/markets/:id/calc', async (req) => {
  let mid = req.params.id
  let choice = Number(req.query.choice)
  let share = Number(req.query.share)

  let market = await app.model.Market.findOne({ condition: { id: mid } })
  if (!market) throw new Error('Market not found')

  let results = await app.model.Result.findAll({ condition: { mid: mid } })
  let v1 = 0
  let v2 = 0
  app.logger.debug('-----------calc market info', market.id, market.share, market.margin, market.total)
  for (let i of results) {
    let choiceItem = app.sdb.get('Result', { mid: mid, choice: i.choice })
    let choiceShare = choiceItem.share
    v1 += Math.exp(choiceShare / market.share)
    if (i.choice === choice) {
      v2 += Math.exp((choiceShare + share) / market.share)
    } else {
      v2 += Math.exp(choiceShare / market.share)
    }
    app.logger.debug('-----------calc choice', choiceShare, v1, v2)
  }
  let c1 = bignum(market.margin).mul(Math.log(v1).toFixed(constants.MAX_DIGITS_PRECISION))
  let c2 = bignum(market.margin).mul(Math.log(v2).toFixed(constants.MAX_DIGITS_PRECISION))
  let amount = bignum(c2).sub(c1).floor().toString()
  app.logger.debug('-------------calc c1 c2 amount', c1, c2, amount)
  return { mid: mid, choice: choice, share: share, amount: amount }
})

app.route.get('/markets/:id/results', async (req) => {
  let mid = req.params.id
  if (!mid) throw new Error('Invalid params')

  let results = await app.model.Result.findAll({
    condition: {
      mid: mid
    }
  })
  if (req.query.probability) {
    let market = await app.model.Market.findOne({
      condition: {
        id: mid
      }
    })
    if (!market) throw new Error('Market not found')
    let sum = 0
    for (let i of results) {
      sum += Math.exp(i.share / market.share)
    }
    for (let i of results) {
      i.probability = Math.exp(i.share / market.share) / sum
    }
  }
  return { results: results }
})

app.route.get('/markets/:id/trades', async (req) => {
  let condiiton = { mid: req.params.id }
  let count = await app.model.Trade.count(condiiton)
  let trades = []
  if (count > 0) {
    trades = await app.model.Trade.findAll({
      condition: {
        mid: req.params.id
      },
      sort: {
        timestamp: -1
      },
      limit: req.query.limit || 50,
      offset: req.query.offset || 0
    })
  }
  return { trades: trades, count: count }
})

app.route.get('/markets/:id/settles', async (req) => {
  let condiiton = { mid: req.params.id }
  let count = await app.model.Settle.count(condiiton)
  let settles = []
  if (count > 0) {
    settles = await app.model.Settle.findAll({
      condition: {
        mid: req.params.id
      },
      sort: {
        timestamp: -1
      },
      limit: req.query.limit || 50,
      offset: req.query.offset || 0
    })
  }
  return { settles: settles, count: count }
})

app.route.get('/markets/:id/appeals', async (req) => {
  let condiiton = { mid: req.params.id }
  let count = await app.model.Appeal.count(condiiton)
  let appeals = []
  if (count > 0) {
    appeals = await app.model.Appeal.findAll({
      condition: {
        mid: req.params.id
      },
      sort: {
        timestamp: -1
      },
      limit: req.query.limit || 50,
      offset: req.query.offset || 0
    })
  }
  return { appeals: appeals, count: count }
})

app.route.get('/markets/:id/comments', async (req) => {
  let condiiton = { mid: req.params.id }
  let count = await app.model.Comment.count(condiiton)
  let comments = []
  if (count > 0) {
    comments = await app.model.Comment.findAll({
      condition: {
        mid: req.params.id
      },
      sort: {
        timestamp: -1
      },
      limit: req.query.limit || 50,
      offset: req.query.offset || 0
    })

    let addresses = comments.map((c) => c.authorId)
    let accounts = await app.model.Account.findAll({
      condition: {
        address: { $in: addresses }
      },
      fields: ['str1', 'address']
    })
    let accountMap = new Map
    for (let account of accounts) {
      accountMap.set(account.address, account)
    }
    for (let c of comments) {
      let account = accountMap.get(c.authorId)
      if (account) {
        c.nickname = account.str1
      }
    }
  }
  return { comments: comments, count: count }
})

app.route.get('/markets/:id/reveal', async (req) => {
  let reveal = await app.model.Reveal.findOne({
    condition: {
      mid: req.params.id
    }
  })
  if (!reveal) throw new Error('Reveal not found')
  return { reveal: reveal }
})

app.route.get('/markets/:id/verdict', async (req) => {
  let verdict = await app.model.Verdict.findOne({
    condition: {
      mid: req.params.id
    }
  })
  if (!verdict) throw new Error('Verdict not found')
  return { verdict: verdict }
})

app.route.get('/markets/:id/shares/:address', async (req) => {
  let id = req.params.id
  let address = req.params.address
  let shares = await app.model.Share.findAll({
    condition: {
      mid: id,
      address: address
    }
  })
  return { shares: shares, count: shares.length }
})

app.route.get('/shares/:address', async (req) => {
  let address = req.params.address
  let condition = { address: address }
  let count = await app.model.Share.count(condition)
  let shares = []
  if (count > 0) {
    shares = await app.model.Share.findAll({
      condition: condition
    })
  }
  return { count: count, shares: shares }
})