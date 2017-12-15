module.exports = {
  name: 'shares',
  fields: [
    {
      name: 'mid',
      type: 'String',
      length: 32,
      not_null: true,
      index: true
    },
    {
      name: 'address',
      type: 'String',
      length: 50,
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
      name: 'share',
      type: 'BigInt',
      default: 0
    }
  ]
}