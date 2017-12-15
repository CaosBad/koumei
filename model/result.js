module.exports = {
  name: 'results',
  fields: [
    {
      name: 'mid',
      type: 'String',
      length: 32,
      not_null: true,
      index: true
    },
    {
      name: 'choice',
      type: 'Number',
      not_null: true,
      index: true
    },
    {
      name: 'desc',
      type: 'String',
      length: 256,
      not_null: true
    },
    {
      name: 'share',
      type: 'BigInt',
      default: 0
    }
  ]
}