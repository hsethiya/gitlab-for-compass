import { useEffect, useState } from 'react';
import { FeaturesList, GitlabFeaturesEnum } from '../features';
import { listFeatures } from '../services/invokes';
import { DefaultErrorTypes, ErrorTypes } from '../resolverTypes';

export const useFeatures = (): [FeaturesList, boolean, ErrorTypes | undefined] => {
  const [features, setFeatures] = useState<FeaturesList>({
    [GitlabFeaturesEnum.SEND_STAGING_EVENTS]: false,
    [GitlabFeaturesEnum.CREATE_FROM_YAML]: false,
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<ErrorTypes>();

  const fetchFeatures = async (): Promise<void> => {
    setLoading(true);
    try {
      const { data, errors, success } = await listFeatures();
      if (success && data) {
        setFeatures(data);
      }
      if (errors && errors.length > 0) {
        setError(errors[0].errorType);
      }
    } catch {
      setError(DefaultErrorTypes.UNEXPECTED_ERROR);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeatures();
  }, []);

  return [features, loading, error];
};
