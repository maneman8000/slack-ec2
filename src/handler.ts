import { WebClient } from '@slack/web-api';
import { EC2Client, DescribeInstancesCommand, StartInstancesCommand, StartInstancesCommandOutput, StopInstancesCommand, StopInstancesCommandOutput } from "@aws-sdk/client-ec2";
import { parseInstanceObj, InstanceInfo } from './utils';

const REGION = process.env.REGION;
const SLACK_TOKEN = process.env.SLACK_TOKEN;
const VERIFICATION_TOKEN = process.env.VERIFICATION_TOKEN;
const FORCE_INSTANCE = process.env.FORCE_INSTANCE;
const SCHEDULED_INSTANCE = process.env.SCHEDULED_INSTANCE;
const SCHEDULED_MESSAGE_CHANNEL = process.env.SCHEDULED_MESSAGE_CHANNEL;

const escapeMention = (m: string) => {
  return m.replace(/\@/g, '@ ');
};

const STARTING_MESSAGES = escapeMention(process.env.STARTING_MESSAGES || '').split('|');
const STOPPING_MESSAGES = escapeMention(process.env.STOPPING_MESSAGES || '').split('|');

const sendMessage = async (channel, message) => {
  const client = new WebClient(SLACK_TOKEN);
  const result = await client.chat.postMessage({
    text: message,
    channel: channel,
  });
};

const ec2 = () => {
  let ec2: EC2Client | undefined = undefined;
  return (() => {
    if (typeof ec2 === "undefined") {
      ec2 = new EC2Client({region: REGION});
    }
    return ec2;
  })();
};

const ec2Instances = async () => {
  const command = new DescribeInstancesCommand({});
  const data = await ec2().send(command);

  return parseInstanceObj(data.Reservations);
};

const handleStatus = async (option?: string): Promise<string> => {
  try {
    const instances = await ec2Instances();
    if (instances.length === 0) {
      return "no instances";
    }
    const message = instances.filter((instance) => {
      if (option && option === "all") {
        return true;
      }
      else if (FORCE_INSTANCE) {
        return instance.name === FORCE_INSTANCE;
      }
      else {
        return true;
      }
    }).map((instance) => {
      let res = `${instance.name}: ${instance.state}`;
      if (instance.publicIpAddress) {
        res += `: ${instance.publicIpAddress}`;
      }
      return res;
    }).join("\n");
    return message;
  } catch(e) {
    console.log("ERROR: " + e);
    return "error!: " + JSON.stringify(e);
  }
};

const findInstance = (instances: InstanceInfo[], name?: string): InstanceInfo | undefined => {
  if (!name && FORCE_INSTANCE) {
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

const startEc2Instance = async (instanceId: string): Promise<StartInstancesCommandOutput> => {
  const command = new StartInstancesCommand({ InstanceIds: [instanceId] });
  return await ec2().send(command);
};

const stopEc2Instance = async (instanceId: string): Promise<StopInstancesCommandOutput> => {
  const command = new StopInstancesCommand({ InstanceIds: [instanceId] });
  return await ec2().send(command);
};

const randomPick = (arr: string[]) => {
  return arr[Math.floor(Math.random() * arr.length)];
};

const handleStart = async (name?: string) => {
  try {
    const instances = await ec2Instances();
    const instance = findInstance(instances, name);
    let message = '';
    if (instance) {
      const result = await startEc2Instance(instance.instanceId);
      if (result.StartingInstances) {
        message = randomPick(STARTING_MESSAGES);
      }
      else {
        message = JSON.stringify(result);
      }
    }
    else {
      message = "can't find instance: " + name;
    }
    return message;
  } catch(e) {
    console.log("ERROR: " + e);
    return "error!: " + JSON.stringify(e);
  }
};

const handleStop = async (name?: string) => {
  try {
    const instances = await ec2Instances();
    const instance = findInstance(instances, name);
    let message = '';
    if (instance) {
      const result = await stopEc2Instance(instance.instanceId);
      if (result.StoppingInstances) {
        message = randomPick(STOPPING_MESSAGES);
      }
      else {
        message = JSON.stringify(result);
      }
    }
    else {
      message = "can't find instance: " + name;
    }
    return message;
  } catch(e) {
    console.log("ERROR: " + e);
    return "error!: " + JSON.stringify(e);
  }
};

const ec2Main = async (text): Promise<string> => {
  let m;
  if (m = text.match(/status(?:\s(.+))?/)) {
    return await handleStatus(m[1]);
  }
  else if (m = text.match(/start(?:\s(.+))?/)) {
    return await handleStart(m[1]);
  }
  else if (m = text.match(/stop(?:\s(.+))?/)) {
    return await handleStop(m[1]);
  }
  return "unknown command";
};

export async function events(event, context, callback) {
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

  const message = await ec2Main(data.event.text);
  await sendMessage(data.event.channel, message);

  return {
    message,
    input: event,
  };
}

const checkAndStop = async (name) => {
  try {
    const instances = await ec2Instances();
    const instance = findInstance(instances, name);
    let message = '';
    if (instance) {
      const result = await stopEc2Instance(instance.instanceId);
      if (result.StoppingInstances) {
        const instance = result.StoppingInstances[0];
        if (instance && instance.PreviousState?.Name === "running") {
          message = randomPick(STOPPING_MESSAGES);
        }
      }
      else {
        message = JSON.stringify(result);
      }
    }
    else {
      message = "can't find instance: " + name;
    }
    if (message.length > 0) {
      return message;
    }
    return;
  } catch(e) {
    console.log("ERROR: " + e);
    return "error!: " + JSON.stringify(e);
  }
};

export async function scheduled(event, context, callback) {
  if (SCHEDULED_INSTANCE) {
    const message = await checkAndStop(SCHEDULED_INSTANCE);
    await sendMessage(SCHEDULED_MESSAGE_CHANNEL, message);

    return {
      message,
      input: event,
    };
  }
};
