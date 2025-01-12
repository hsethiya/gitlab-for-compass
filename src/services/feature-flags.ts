import { FeaturesList, GitlabFeaturesEnum } from '../features';

export const isSendStagingEventsEnabled = (defaultValue = false): boolean => {
  return process.env.FF_SEND_STAGING_EVENTS === 'true' || defaultValue;
};

export const isCreateFromYamlEnabled = (defaultValue = false): boolean => {
  return process.env.CREATE_FROM_YAML_FF === 'true' || defaultValue;
};

export const listFeatures = (): FeaturesList => {
  return {
    [GitlabFeaturesEnum.SEND_STAGING_EVENTS]: isSendStagingEventsEnabled(),
    [GitlabFeaturesEnum.CREATE_FROM_YAML]: isCreateFromYamlEnabled(),
  };
};
