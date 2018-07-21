
const parseInstanceObj = (data) => {
  let instances = [];
  if (!data || !data.Reservations) return [];
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

module.exports.parseInstanceObj = parseInstanceObj;
