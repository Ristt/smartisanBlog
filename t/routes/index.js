const fs = require('fs')
const express = require('express')
const router = express.Router()
const superagent = require('superagent')
const Eventproxy = require('eventproxy')
const moment = require('moment')
require('shelljs/global')

const account = require('../config.json')
// const errorCode = require('../error_code.json')

const url = {
  getCookie: 'https://account.smartisan.com/v2/session/?m=post',
  getProfile: 'https://cloud.smartisan.com/index.php?r=account%2Flogin',
  getNote: 'https://cloud.smartisan.com/apps/note/index.php?r=v2%2FgetList',
  getImage: 'https://cloud.smartisan.com/notesimage/',
  itorr: 'http://x.mouto.org/wb/x.php?up'
}

const header = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.59 Safari/537.36',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
}

let ep = new Eventproxy()

var ticket = {
  value: null,
  expires: null,
  _outOfDate: function () {
    return this.expires < new Date()
  },
  _init: function () {
    var that = this
    superagent
            .post(url.getCookie)
            .set(header)
            .set('Referer', 'https://account.smartisan.com/')
            .send(account)
            .redirects(0)
            .end((err, response) => {
              if (err || !response.ok) {
                console.log('出错了!')
              } else {
                console.log('成功获取了 uid: ' + JSON.stringify(response.body))
                console.log(response.headers['set-cookie'])

                that.value = response.headers['set-cookie']
                    .join(',').match(/SCA_SESS=([\w\-]{16,64})/i)[1]
                moment.locale('zh-cn')
                const time = moment()
                const expires = time.add(7, 'days')
                that.expires = expires.format('YYYY-MM-DD HH:mm:ss')

                console.log('成功获取ticket: ' + that.value)
                console.log('将于 ' + that.expires + ' 过期')

                ep.emit('got_ticket', that.value)
              }
            })
  }
}

let execute = (method, res) => {
  if (ticket._outOfDate()) {
    console.log('ticket 过期了!')
    ticket._init()
    ep.on('got_ticket', (_ticket) => {
      method(_ticket, res)
    })
  } else {
    method(ticket.value, res)
  }
}

const getProfile = (ticket, res) => {
  superagent
        .get(url.getProfile)
        .set(header)
        .set('Referer', 'https://cloud.smartisan.com/')
        .set('Cookie', 'SCA_SESS=' + ticket + '-a; SCA_LOGIN=1')
        .end((err, response) => {
          if (err || !response.ok) {
            console.log('出错了')
          } else {
            console.log('成功获取个人信息: ' + JSON.stringify(response.body))
            const payload = {
              'uid': response.body['data']['uid'],
              'nickname': response.body['data']['nickname'],
              'avatar_url': response.body['data']['avatar_url']
            }
            fs.writeFileSync('./output/info.json', JSON.stringify(payload, null, 2) , 'utf-8')
            res.send(JSON.stringify(payload))
          }
        })
}

const getNote = (ticket, res) => {
  superagent
        .get(url.getNote)
        .set(header)
        .set('Referer', 'https://cloud.smartisan.com/apps/note/')
        .set('Cookie', 'SCA_SESS=' + ticket + '-a; SCA_LOGIN=1')
        .end((err, response) => {
          if (err || !response.ok) {
            console.log('出错了')
          } else {
            const length = JSON.stringify(response.body['data']['note'].length)
            console.log('成功获取' + length + '条便签:\r')
            console.log(JSON.stringify(response.body))
            const payload = []
            for (let offset = 0; offset < length; offset++) {
              if (JSON.stringify(response.body['data']['note'][offset]['favorite']) === '1') {
                payload.push(response.body['data']['note'][offset])
              }
            }
            console.log('成功输出' + payload.length + '条便签:\r')
            console.log('输出是' + JSON.stringify(payload))
            fs.writeFileSync('./output/post.json', JSON.stringify(payload, null, 2), 'utf-8')
            res.send(payload)
          }
        })
}

let downCount = 0
const downStatus = (totalCount, current) => {
  ++downCount
  console.log(current + '下载完成!')
  console.log('历史的进程: ' + downCount + '/' + totalCount)
  return totalCount === downCount
}

const getImage = (ticket, res) => {
  downCount = 0
  const post = fs.readFileSync('./output/post.json', 'utf-8')
  const 图片们 = post.match(/Notes_\w+\.(png|jpeg|jpg|gif)/ig)
  console.log(图片们)
  const 锤子数组 = []
  for (let offset = 0; offset < 图片们.length; offset++) {
    锤子数组.push(url.getImage + 图片们[offset])
  }
  console.log(锤子数组)
  fs.writeFileSync('./output/t.json', JSON.stringify(锤子数组, null, 2), 'utf-8')
  for (let offset = 0; offset < 锤子数组.length; offset ++) {
    console.log('我是第' + offset + '个' + 锤子数组[offset])
    console.log('我是第' + offset + '个' + 图片们[offset])

    superagent
        .get(锤子数组[offset])
        .set(header)
        .set('Referer', 'https://cloud.smartisan.com/apps/note/')
        .set('Cookie', 'SCA_SESS=' + ticket + '-a; SCA_LOGIN=1')
        .end((err, response) => {
          if (err || !response.ok) {
            console.log('出错了!')
          } else {
            fs.writeFileSync('./pics/'+图片们[offset], response.body)
            if (downStatus(图片们.length, 图片们[offset])) {
              res.send('所有图片下载完成!\r\n' + 图片们)
            }
            console.log(response.body)
          }
        })
  }
}

router.get('/info', (req, res) => {
  execute(getProfile, res)
})

router.get('/post', (req, res) => {
  execute(getNote, res)
})

router.get('/t', (req, res) => {
  execute(getImage, res)
})

router.get('/pics', (req, res) => {
  const post = fs.readFileSync('./output/post.json', 'utf-8')
  const 图片们 = post.match(/Notes_\w+\.(png|jpeg|jpg|gif)/ig)
  const payload = []
  console.log(图片们.length)
  for (let offset = 0; offset < 图片们.length; offset++) {
    let file = fs.readFileSync('./pics/' + 图片们[offset])
    superagent
        .post(url.itorr)
        .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.59 Safari/537.36')
        .set('Content-Type', 'multipart/form-data')
        .attach('file', file, './pics'+ 图片们[offset])
        .end((err, response) => {
          if (err || !response.ok) {
            console.log('出错了!')
          } else {
            console.log('当前下标' + offset)
            console.log('正在上传' + 图片们[offset])
            console.log('一共有' + 图片们.length)

            const a = {}
            const key = 图片们[offset]
            const value = response.body.pid
            a[key] = value
            payload.push(a)

            if (offset === 图片们.length - 1) {
              console.log(payload)
              fs.writeFileSync('./output/pics.json', JSON.stringify(payload, null, 2), 'utf-8')
              res.send('跟偷偷肉交易完毕!\r\n' + JSON.stringify(payload))
            }
          }
        })
  }
})

router.get('/replace', (req, res) => {
  const itorr = JSON.parse(fs.readFileSync('./output/pics.json', 'utf-8'))
  const tobeReplaced = fs.readFileSync('./output/post.json', 'utf-8').match((/Notes_\w+\.(png|jpeg|jpg|gif)/ig))
  for (let offset = 0; offset < tobeReplaced.length; offset++) {
    console.log(tobeReplaced[offset])
    const searchPattern = new RegExp(tobeReplaced[offset])
    console.log(searchPattern)
    const wb = itorr[offset][tobeReplaced[offset]]
    sed('-i', searchPattern, wb, './output/post.json')
  }
  res.send('替换完成!')
})

module.exports = router
