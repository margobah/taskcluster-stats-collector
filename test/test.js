suite('stats-collection', () => {
  test('collect stats', async () => {
    var debug = require('debug')('test:test');
    var assert = require('assert');
    var collector = require('../lib/collector.js');
    var slugid = require('slugid');
    var taskcluster = require('taskcluster-client');
    var base = require('taskcluster-base');
    var monitoring = require('taskcluster-lib-monitor');

    let cfg = base.config({profile: 'test'});

    var taskdefn = {
      provisionerId: 'stats-provisioner',
      workerType: 'stats-dummy',
      payload: {},
      created: taskcluster.fromNowJSON(),
      deadline: taskcluster.fromNowJSON('2 hours'),
      metadata: {
        name: 'Testing!',
        description: 'testing?',
        owner: 'eggylv999@gmail.com',
        source: 'https://github.com/taskcluster/taskcluster-stats-collector',
      },
    };

    assert(cfg.pulse, 'pulse credentials required');
    assert(cfg.taskcluster, 'taskcluster credentials required');

    let monitor = await monitoring({
     project: 'tc-stats-collector',
     credentials: {clientId: 'fake', accessToken: 'alsofake'},
     mock: true,
    });

    let col = await collector({
      credentials: cfg.pulse,
      queueName: undefined,
      routingKey: {
        provisionerId: 'stats-provisioner',
      },
      monitor,
    });
    var id = slugid.v4();
    var queue = new taskcluster.Queue({
      credentials: cfg.taskcluster.credentials,
    });

    let result = await queue.createTask(id, taskdefn);
    assert(result);
    debug('task created');

    await queue.claimTask(id, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker',
      });
    debug('task claimed');

    await queue.reportException(id, 0, {reason: 'worker-shutdown'});
    debug('task exception');

    await queue.claimTask(id, 1, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker',
      });
    debug('task claimed again');

    await queue.reportCompleted(id, 1);
    debug('task completed');

    await col.close();

    assert.deepEqual(monitor.counts, {
      'tasks.stats-dummy.resolved.worker-shutdown': 1,
      'tasks.stats-dummy.resolved.completed': 1,
    });
    assert(monitor.measures['tasks.stats-dummy.running']);
    assert.equal(monitor.measures['tasks.stats-dummy.running'].length, 2);
  });
});
