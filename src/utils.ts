import { DescribeInstancesCommandOutput } from '@aws-sdk/client-ec2';

export type InstanceInfo = {
  instanceId: string;
  state: string;
  name: string;
  publicIpAddress: string;
}

export const parseInstanceObj = (reservations?: DescribeInstancesCommandOutput["Reservations"]) => {
  let instances: InstanceInfo[] = [];
  if (!reservations) return [];
  reservations.forEach(reservation => {
    if (reservation.Instances) {
    reservation.Instances.forEach(instance => {
        let name = 'unknown server';
        if (instance.Tags && instance.Tags.length > 0) {
          name = instance.Tags.reduce((prev, current) => {
            return current.Key === 'Name' ? (current.Value || "no name") : prev;
          }, (instance.Tags[0].Value || ''));
        }
        instances.push({
          instanceId: instance.InstanceId || '',
          state: instance.State?.Name || 'unknown',
          name : name,
          publicIpAddress: instance.PublicIpAddress || 'xxx.xxx.xxx.xxx',
       });
    });
  }
  });
  return instances;
};
