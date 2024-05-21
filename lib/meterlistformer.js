/**
 * meterlistformer.js
 *   Объединяет каналы в узлы и формирует список счетчиков meterlist
 *
 *    элемент массива meterlist содержит параметры узла, правила опроса и каналы:
 *    {addr:'123456',  // адрес счетчика
 *     parentname:'Cчетчик 101010', // имя счетчика (узла), подставляется в результат чтения - только для удобства отладки
 *     assets:{ks:...},   // коэффициенты счетчика
 *
 *     polls: // массив опроса, соотв элементам в pollArray, но берутся только для каналов, которые нужно читать
 *     [{chan: 'I1', r:1, polltimefctr:10, countdown:8},
 *      {chan: 'I2', r:1, polltimefctr:1, countdown:1},
 *      {mid: 'E', r:1, polltimefctr:1, countdown:1},
 *     ],
 *
 *     chans: // каналы
 *      {I1:{id:'lYgBDoH6vg1',  chan:'I1', r:1},
 *       ...
 *       EAP:{id:'yk-df4z1Qs',  chan:'EAP', r:1},
 *       EAM:{id:'E4ieiP2wOX',  chan:'EAM', r:0},
 *       ...
 *      }
 *     pollIdx:-1 // индекс текущего запроса в polls, -1 - запрос пароля
 *    }
 *
 * @return {Array of Objects} - meterlist
 */

const util = require('util');

const utils = require('./utils');
const protocol = require('./protocol');

module.exports = function(devhard, plugin) {
  if (!devhard || !Array.isArray(devhard)) return [];
 
  // Собрать узлы
  try {
    const meterMap = {};
    devhard.forEach(item => {
      if (item.foldertype == 'node') {
        if (!item.addr) {
          plugin.log(item.chan + ': отсутствует серийный номер счетчика. Не включается в список!');
        } else {
          meterMap[item._id] = { node: item, chanArr: [] };
        }
      }
    });

    // Собрать каналы узлов для опроса
    devhard.forEach(item => {
      if (!item.folder) {
        if (!meterMap[item.parent]) {
          plugin.log('WARN: В списке счетчиков отсутствует узел для канала: ' + util.inspect(item) + '. Пропускается..');
        } else if (item.r) meterMap[item.parent].chanArr.push(item);
      }
    });

    // Сформировать массив meterlist
    const meterlist = Object.keys(meterMap).map(key => {
      const { addr, chan } = meterMap[key].node;
      const assets = protocol.formAssets(meterMap[key].node);

      // chanArr - Сортировать по order, чтобы опрашивать в этом порядке

      const arr = meterMap[key].chanArr.sort(utils.byorder('order'));
      const chans = formChanObj(arr); 
      const polls = formPolls(arr);
      return { addr, parentname: chan, assets, polls, chans, pollIdx: -1 };
    });
    return meterlist.map( (item, idx) => ({...item, idx}));

  } catch (e) {
    plugin.log('ERROR: meterlistformer ' + util.inspect(e));
    return [];
  }

  // Создает массив для организации опроса конкретного счетчика
  // Включаются только запросы для каналов с r:1
  // pollArray[0] = {mid: 'I',chan: 'I2'} => {pollArrayIdx:0,  polltimefctr:<из канала>, countdown:0}
  // pollArray[7] = {mid: 'E'} => {pollArrayIdx:7, polltimefctr:<min>, countdown:0}
  function formPolls(chanArr) {
    const pollArray = protocol.createOnePollArray(); // Этот шаблоный массив для опроса

    const res = [];
    for (let item of chanArr) {
      const { chan, r, polltimefctr = 1 } = item;
      if (!r) continue;

      let pollArrayIdx = pollArray.findIndex(pitem => pitem.chan == chan);
      if (pollArrayIdx >= 0) {
        // есть запрос для этого канала
        res.push({ pollArrayIdx, polltimefctr, countdown: 0 });
      } else {
        // Запрос для нескольких каналов
        const mid = chan.substr(0, 1);
        pollArrayIdx = pollArray.findIndex(pitem => pitem.mid == mid);
        if (pollArrayIdx >= 0) {
          // возможно, уже включили в массив
          const resIdx = res.findIndex(ritem => ritem.pollArrayIdx == pollArrayIdx);
          if (resIdx < 0) {
            res.push({ pollArrayIdx, polltimefctr, countdown: 0 });
          } else {
            res[resIdx].polltimefctr = Math.min(res[resIdx].polltimefctr, polltimefctr);
          }
        } else {
          plugin.log('WARN: Для канала ' + chan + ' не найдены правила опроса! Канал не будет опрошен');
        }
      }
    }
    return res;
  }

  // Создает объект с каналами
  // Структура используется при разборе ответа и отправке данных каналов на сервер
  function formChanObj(chanArr) {
    const res = {};
    chanArr.forEach(item => {
      const { _id, chan, r, polltimefctr = 1 } = item;
      const mid = chan.substr(0, 1);
      res[chan] = { id: _id, chan, mid, r, polltimefctr };
    });
    return res;
  }
};
