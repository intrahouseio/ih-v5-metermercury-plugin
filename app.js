/**
 * app.js
 *
 *   Основной модуль плагина
 *   - запрашивает и формирует каналы
 *   - инициализирует объект meters для работы с массивом счетчиков
 *   - запускает агента для опроса
 *   - слушает событие изменения каналов. Это могут быть:
 *        - добавление-удаление узлов (счетчиков)
 *        - изменение парметров каналов (r:1/0, polltimefctr: - изменение интервала опроса)
 *   - по событию изменения
 *       - запрашивает и формирует каналы заново
 */
const util = require('util');

const Agent = require('./lib/agent');
const meters = require('./lib/meters');

module.exports = async function(plugin) {
  let agent;
  try {
    meters.init(plugin);
    await getAndCreateMeterlist();
    agent = new Agent(plugin, plugin.params);
    agent.run();

    plugin.channels.onChange(async () => {
      plugin.log('INFO: Каналы изменены - обновление данных опроса...');
      agent.suspendPolling();
      await getAndCreateMeterlist();
      agent.restartPolling();
    });
  } catch (err) {
    plugin.log('ERROR: ' + util.inspect(err));
    plugin.exit(2);
  }

  async function getAndCreateMeterlist() {
    const devhard = await plugin.devhard.get();
    // plugin.log('Received devhard data: ' + util.inspect(devhard), 2);
    meters.createMeterlist(devhard);
    if (!meters.isEmpty()) {
      plugin.log('INFO: Счетчиков для опроса: ' + meters.list.length);
      meters.list.forEach(meter => {
        const nchan = Object.keys(meter.chans).length;
        plugin.log(' ' + meter.parentname + ' Адрес: ' + meter.addr + ' Каналов для опроса: ' + nchan);
      });
    } else {
      plugin.log('ERROR: Список счетчиков пуст! Нет каналов для опроса...');
      plugin.exit(3);
    }
  }

  process.on('SIGTERM', () => {
    process.exit(0);
  });
};
