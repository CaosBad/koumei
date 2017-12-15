module.exports = {
  name: 'markets',
  fields: [
    {
      name: 'id',
      type: 'String',
      length: 32,
      not_null: true,
      primary_key: true
    },
    {
      name: 'tid',
      type: 'String',
      length: 64,
      not_null: true,
      unique: true,
      index: true
    },
    {
      name: 'initiator',
      type: 'String',
      length: 50,
      not_null: true,
      index: true
    },
    {
      name: 'timestamp',
      type: 'Number',
      not_null: true,
      index: true
    },
    {
      name: 'title',
      type: 'String',
      length: 256,
      not_null: true
    },
    {
      name: 'image',
      type: 'String',
      length: 80,
      not_null: true
    },
    {
      name: 'desc',
      type: 'Text'
    },
    {
      name: 'results',
      type: 'Number',
      not_null: true
    },
    {
      name: 'endHeight',
      type: 'BigInt',
      not_null: true,
      index: true
    },
    {
      name: 'revealHeight',
      type: 'BigInt'
    },
    {
      name: 'state',
      type: 'Number',
      not_null: true,
      index: true,
      default: 0
    },
    {
      name: 'currency',
      type: 'String',
      length: 30,
      index: true
    },
    {
      name: 'margin',
      type: 'String',
      length: 50,
      not_null: true
    },
    {
      name: 'share',
      type: 'Number',
      not_null: true
    },
    {
      name: 'total',
      type: 'String',
      length: 50,
      not_null: true,
      default: '0'
    },
    {
      name: 'revealChoice',
      type: 'Number'
    },
    {
      name: 'verdictChoice',
      type: 'Number'
    }
  ]
}