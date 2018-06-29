'use strict';

const request = require('request-promise-native');
const AWS = require('aws-sdk');

const REGION = process.env.REGION;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const VERIFICATION_TOKEN = process.env.VERIFICATION_TOKEN;
const FORCE_INSTANCE = process.env.FORCE_INSTANCE;

const escapeMention = (m) => {
  return m.replace(/\@/g, '@ ');
};

const STARTING_MESSAGES = escapeMention(process.env.STARTING_MESSAGES).split('|');
const STOPPING_MESSAGES = escapeMention(process.env.STOPPING_MESSAGES).split('|');

const sendMessage = (channel, message) => {
  const option = {
    method: "POST",
    url: "https://slack.com/api/chat.postMessage",
    headers: {
      "Authorization": "Bearer " + AUTH_TOKEN
    },
    json: {
      channel: channel,
      text: message,
      unfurl_links: true
    }
  };
  return request(option);
};

const ec2 = () => {
  let ec2;
  return (() => {
    if (!ec2) {
      ec2 = new AWS.EC2({region: REGION});
    }
    return ec2;
  })();
};

const parseInstanceObj = (data) => {
  let instances = [];
  data.Reservations.forEach(reservation => {
    reservation.Instances.forEach(instance => {
      let name = 'unknown server';
      if (instance.Tags.length > 0) {
        name = instance.Tags.reduce((prev, current) => {
          return current.Key === 'Name' ? current.Value : prev;
        }, instance.Tags[0].Value);
      }
      instances.push({
        instanceId: instance.InstanceId,
        state: instance.State.Name,
        name : name,
        publicIpAddress: instance.PublicIpAddress
      });
    });
  });
  return instances;
};

const ec2Instances = async () => {
  const data = await ec2().describeInstances().promise();
  return parseInstanceObj(data);
};

const handleStatus = async (callback) => {
  try {
    const instances = await ec2Instances();
    const message = instances.filter((instance) => {
      if (FORCE_INSTANCE) {
        return instance.name === FORCE_INSTANCE;
      }
      else {
        return true;
      }
    }).map((instance) => {
      let res = `${instance.name}: ${instance.state}`
      if (instance.publicIpAddress) {
        res += `: ${instance.publicIpAddress}`;
      }
      return res;
    }).join("\n");
    return callback(null, message);
  } catch(e) {
    return callback(null, "error!: " + JSON.stringify(e));
  }
};

const findInstance = (instances, name) => {
  if (FORCE_INSTANCE) {
    return instances.find(i => i.name == FORCE_INSTANCE);
  }
  if (!name) return;
  const instance = instances.find(i => i.name == name);
  if (instance) {
    return instance;
  }
  else {
    // ignore trailing period (for slack reminder)
    const n = name.replace(/\.$/ , '');
    return instances.find(i => i.name == n);
  }
};

const randomPick = (arr) => {
  return arr[Math.floor(Math.random() * arr.length)];
};

const handleStart = async (name, callback) => {
  try {
    const instances = await ec2Instances();
    const instance = findInstance(instances, name);
    let message = '';
    if (instance) {
      const result = await ec2().startInstances({ InstanceIds: [instance.instanceId] }).promise();
      if (result.StartingInstances) {
        message = randomPick(STARTING_MESSAGES);
      }
      else {
        message = JSON.stringify(result);
      }
    }
    else {
      message = "can't find instance";
    }
    return callback(null, message);
  } catch(e) {
    return callback(null, "error!: " + JSON.stringify(e));
  }
};

const handleStop = async (name, callback) => {
  try {
    const instances = await ec2Instances();
    const instance = findInstance(instances, name);
    let message = '';
    if (instance) {
      const result = await ec2().stopInstances({ InstanceIds: [instance.instanceId] }).promise();
      if (result.StoppingInstances) {
        message = randomPick(STOPPING_MESSAGES);
      }
      else {
        message = JSON.stringify(result);
      }
    }
    else {
      message = "can't find instance";
    }
    return callback(null, message);
  } catch(e) {
    return callback(null, "error!: " + JSON.stringify(e));
  }
};

const ec2Main = async (text, callback) => {
  let m;
  if (text.match(/status/)) {
    handleStatus(callback);
  }
  else if (m = text.match(/start(?:\s(.+))?/)) {
    handleStart(m[1], callback);
  }
  else if (m = text.match(/stop(?:\s(.+))?/)) {
    handleStop(m[1], callback);
  }
  else {
    return callback(null, "unknown command");
  }
};

module.exports.events = (event, context, callback) => {
  const data = JSON.parse(event.body);
  const response = {
    statusCode: 200,
    body: "",
  };

  if (data.token !== VERIFICATION_TOKEN) {
    callback(null, { statusCode: 404, body: "token is not valid" });
    return;
  }

  if (data.challenge) {
    response.body = data.challenge;
    callback(null, response);
    return;
  }

  callback(null, response);

  if (data.event) {
    ec2Main(data.event.text, (success, message) => {
      sendMessage(data.event.channel, message);
    });
  }
  else {
    callback(null, response);
  }
};
