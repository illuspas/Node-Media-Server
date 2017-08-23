const md5 = require('crypto').createHash('md5');
let key = 'nodemedia2017privatekey';
let exp = (Date.now() / 1000 | 0) + 60;
let streamId = '/live/stream';
console.log(exp+'-'+md5.update(streamId+'-'+exp+'-'+key).digest('hex'));
