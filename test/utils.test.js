const fs = require('fs');
const path = require('path');
const util = require('util');
const utils = require("../src/utils");

const readFileAsync = util.promisify(fs.readFile);

describe('parseInstanceObj', () => {
  test('it can parse describe instances', async () => {
    const data = JSON.parse(await readFileAsync(path.resolve(__dirname, './fixtures/describe-instances.json')));
    const ret = utils.parseInstanceObj(data);
    expect(ret).toEqual([
      {
        "instanceId": "i-0000000000000000",
        "name": "instance1",
        "publicIpAddress": "123.123.123.123",
        "state": "stopped"
      },
      {
        "instanceId": "i-0000000000000001",
        "name": "instance2",
        "publicIpAddress": "123.123.123.124",
        "state": "running"
      }
    ]);
  });
  test('it returns blank array when blank data was passed', () => {
    expect(utils.parseInstanceObj({})).toEqual([]);
    expect(utils.parseInstanceObj(null)).toEqual([]);
  });
});
