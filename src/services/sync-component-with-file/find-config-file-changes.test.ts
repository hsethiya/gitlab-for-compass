/* eslint-disable import/first */
import { mocked } from 'jest-mock';
import { mockForgeApi } from '../../__tests__/helpers/forge-helper';

mockForgeApi();

import { getCommitDiff, getFileContent } from '../../client/gitlab';
import { findConfigAsCodeFileChanges } from './find-config-file-changes';
import { generatePushEvent } from '../../__tests__/helpers/gitlab-helper';
import { CommitFileDiff, CompassYaml, ComponentChanges, PushEvent } from '../../types';

jest.mock('../../client/gitlab', () => ({
  getCommitDiff: jest.fn(),
  getFileContent: jest.fn(),
}));

const getCommitDiffMock = mocked(getCommitDiff);
const getFileContentMock = mocked(getFileContent);

const createCommitFileDiffMock = (
  mockFileContents: CompassYaml[],
  overrideCommitFileDiff: Partial<CommitFileDiff> = {},
): CommitFileDiff => {
  mockFileContents.forEach((fileContent) => getFileContentMock.mockResolvedValueOnce(fileContent));

  return {
    diff: 'diff',
    new_path: 'new/path',
    old_path: 'old/path',
    new_file: false,
    renamed_file: false,
    deleted_file: false,
    ...overrideCommitFileDiff,
  };
};

const mockModifiedDiff = (fileBefore: CompassYaml, fileAfter: CompassYaml) => {
  const commitFileDiff = createCommitFileDiffMock([fileBefore, fileAfter], {
    old_path: 'compass.yml',
    new_path: 'compass.yml',
  });

  getCommitDiffMock.mockResolvedValue([commitFileDiff]);
};

const mockMovedDiffAsRename = (fileBefore: CompassYaml, fileAfter: CompassYaml) => {
  const commitFileDiff = createCommitFileDiffMock([fileBefore, fileAfter], {
    renamed_file: true,
    old_path: 'compass.yml',
    new_path: 'folder/compass.yml',
  });

  getCommitDiffMock.mockResolvedValue([commitFileDiff]);
};

const mockMovedDiffAsAddedAndDeleted = (fileBefore: CompassYaml, fileAfter: CompassYaml) => {
  const commitFileDiffAdded = createCommitFileDiffMock([fileAfter], {
    new_file: true,
    old_path: 'compass.yml',
    new_path: 'compass.yml',
  });
  const commitFileDiffDeleted = createCommitFileDiffMock([fileBefore], {
    deleted_file: true,
    old_path: 'folder/compass.yml',
    new_path: 'folder/compass.yml',
  });

  getCommitDiffMock.mockResolvedValue([commitFileDiffAdded, commitFileDiffDeleted]);
};

describe('findConfigAsCodeFileChanges', () => {
  let baseEvent: PushEvent;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CREATE_FROM_YAML_FF = 'false';
    baseEvent = generatePushEvent();
  });

  it('returns empty component changes if no changes present', async () => {
    getCommitDiffMock.mockResolvedValue([]);

    const expectedResult: ComponentChanges = {
      componentsToCreate: [],
      componentsToUpdate: [],
      componentsToUnlink: [],
    };

    const result = await findConfigAsCodeFileChanges(baseEvent, 'token');
    expect(result).toEqual(expectedResult);
  });

  it('creates component', async () => {
    const compassYaml = { id: 'added' };
    const commitFileDiffAdded = createCommitFileDiffMock([compassYaml], {
      new_file: true,
      old_path: 'compass.yml',
      new_path: 'compass.yml',
    });
    getCommitDiffMock.mockResolvedValue([commitFileDiffAdded]);
    const expectedResult: ComponentChanges = {
      componentsToCreate: [
        {
          componentYaml: compassYaml,
          absoluteFilePath: 'compass.yml',
          filePath: '/compass.yml',
        },
      ],
      componentsToUpdate: [],
      componentsToUnlink: [],
    };

    const result = await findConfigAsCodeFileChanges(baseEvent, 'token');

    expect(result).toEqual(expectedResult);
  });

  it('unlinks component', async () => {
    const compassYaml = { id: 'deleted' };
    const commitFileDiffRemoved = createCommitFileDiffMock([compassYaml], {
      deleted_file: true,
      old_path: 'compass.yml',
      new_path: 'compass.yml',
    });
    getCommitDiffMock.mockResolvedValue([commitFileDiffRemoved]);
    const expectedResult: ComponentChanges = {
      componentsToCreate: [],
      componentsToUpdate: [],
      componentsToUnlink: [
        {
          componentYaml: compassYaml,
          filePath: '/compass.yml',
        },
      ],
    };

    const result = await findConfigAsCodeFileChanges(baseEvent, 'token');

    expect(result).toEqual(expectedResult);
  });

  it('updates component', async () => {
    const compassYamlBefore = { id: 'id', description: 'desc1' };
    const compassYamlAfter = { id: 'id', description: 'desc2' };
    mockModifiedDiff(compassYamlBefore, compassYamlAfter);

    const expectedResult: ComponentChanges = {
      componentsToCreate: [],
      componentsToUpdate: [
        {
          componentYaml: compassYamlAfter,
          absoluteFilePath: 'compass.yml',
          filePath: '/compass.yml',
          previousFilePath: '/compass.yml',
        },
      ],
      componentsToUnlink: [],
    };

    const result = await findConfigAsCodeFileChanges(baseEvent, 'token');

    expect(result).toEqual(expectedResult);
  });

  it('updates component when the config file moved with minimum changes and treated by Gitlab as rename', async () => {
    const compassYamlBefore = { id: 'id' };
    const compassYamlAfter = { id: 'id' };
    mockMovedDiffAsRename(compassYamlBefore, compassYamlAfter);

    const expectedResult: ComponentChanges = {
      componentsToCreate: [],
      componentsToUpdate: [
        {
          componentYaml: compassYamlAfter,
          absoluteFilePath: 'folder/compass.yml',
          filePath: '/folder/compass.yml',
          previousFilePath: '/compass.yml',
        },
      ],
      componentsToUnlink: [],
    };

    const result = await findConfigAsCodeFileChanges(baseEvent, 'token');

    expect(result).toEqual(expectedResult);
  });

  it('updates component when the config file moved with minimum changes and treated by Gitlab as two files - deleted and added', async () => {
    const compassYamlBefore = { id: 'id' };
    const compassYamlAfter = { id: 'id' };
    mockMovedDiffAsAddedAndDeleted(compassYamlBefore, compassYamlAfter);

    const expectedResult: ComponentChanges = {
      componentsToCreate: [],
      componentsToUpdate: [
        {
          componentYaml: compassYamlAfter,
          absoluteFilePath: 'compass.yml',
          filePath: '/compass.yml',
          previousFilePath: '/folder/compass.yml',
        },
      ],
      componentsToUnlink: [],
    };

    const result = await findConfigAsCodeFileChanges(baseEvent, 'token');

    expect(result).toEqual(expectedResult);
  });

  it('unlinks component and adds new one when the id changed', async () => {
    const compassYamlBefore = { id: 'id1' };
    const compassYamlAfter = { id: 'id2' };
    mockModifiedDiff(compassYamlBefore, compassYamlAfter);
    const expectedResult: ComponentChanges = {
      componentsToCreate: [
        {
          componentYaml: compassYamlAfter,
          absoluteFilePath: 'compass.yml',
          filePath: '/compass.yml',
          previousFilePath: '/compass.yml',
        },
      ],
      componentsToUpdate: [],
      componentsToUnlink: [
        {
          componentYaml: compassYamlBefore,
        },
      ],
    };

    const result = await findConfigAsCodeFileChanges(baseEvent, 'token');

    expect(result).toEqual(expectedResult);
  });

  describe('create from yaml enabled', () => {
    let event: PushEvent;

    beforeEach(() => {
      jest.clearAllMocks();
      event = generatePushEvent();
      process.env.CREATE_FROM_YAML_FF = 'true';
    });

    test('updates component when the id added and the name is the same', async () => {
      const compassYamlBefore = { name: 'name' };
      const compassYamlAfter = { name: 'name', id: 'id' };
      mockModifiedDiff(compassYamlBefore, compassYamlAfter);

      const expectedResult: ComponentChanges = {
        componentsToCreate: [],
        componentsToUpdate: [
          {
            componentYaml: compassYamlAfter,
            absoluteFilePath: 'compass.yml',
            filePath: '/compass.yml',
            previousFilePath: '/compass.yml',
          },
        ],
        componentsToUnlink: [],
      };

      const result = await findConfigAsCodeFileChanges(event, 'token');

      expect(result).toEqual(expectedResult);
    });

    test('updates component when the id added and the name is changed', async () => {
      const compassYamlBefore = { name: 'name' };
      const compassYamlAfter = { name: 'name-2', id: 'id' };
      mockModifiedDiff(compassYamlBefore, compassYamlAfter);

      const expectedResult: ComponentChanges = {
        componentsToCreate: [],
        componentsToUpdate: [
          {
            componentYaml: compassYamlAfter,
            absoluteFilePath: 'compass.yml',
            filePath: '/compass.yml',
            previousFilePath: '/compass.yml',
          },
        ],
        componentsToUnlink: [],
      };
      const result = await findConfigAsCodeFileChanges(event, 'token');

      expect(result).toEqual(expectedResult);
    });

    test('updates component when the config file moved with minimum changes, same name, added id and moved with minimum changes that treated by Gitlab as rename', async () => {
      const compassYamlBefore = { name: 'name' };
      const compassYamlAfter = { name: 'name', id: 'id' };
      mockMovedDiffAsRename(compassYamlBefore, compassYamlAfter);

      const expectedResult: ComponentChanges = {
        componentsToCreate: [],
        componentsToUpdate: [
          {
            componentYaml: compassYamlAfter,
            absoluteFilePath: 'folder/compass.yml',
            filePath: '/folder/compass.yml',
            previousFilePath: '/compass.yml',
          },
        ],
        componentsToUnlink: [],
      };
      const result = await findConfigAsCodeFileChanges(event, 'token');

      expect(result).toEqual(expectedResult);
    });

    test('updates component when the config file moved with major changes same name, added id and moved with major changes that treated by Gitlab as two files - deleted and added', async () => {
      const compassYamlBefore = { name: 'name' };
      const compassYamlAfter = { name: 'name', id: 'id' };
      mockMovedDiffAsAddedAndDeleted(compassYamlBefore, compassYamlAfter);

      const expectedResult: ComponentChanges = {
        componentsToCreate: [],
        componentsToUpdate: [
          {
            componentYaml: compassYamlAfter,
            absoluteFilePath: 'compass.yml',
            filePath: '/compass.yml',
            previousFilePath: '/folder/compass.yml',
          },
        ],
        componentsToUnlink: [],
      };
      const result = await findConfigAsCodeFileChanges(event, 'token');

      expect(result).toEqual(expectedResult);
    });

    test('unlinks component and adds the new one when the id removed and the name is the same', async () => {
      const compassYamlBefore = { name: 'name', id: 'id' };
      const compassYamlAfter = { name: 'name' };
      mockModifiedDiff(compassYamlBefore, compassYamlAfter);

      const expectedResult: ComponentChanges = {
        componentsToCreate: [
          {
            componentYaml: compassYamlAfter,
            absoluteFilePath: 'compass.yml',
            filePath: '/compass.yml',
            previousFilePath: '/compass.yml',
          },
        ],
        componentsToUpdate: [],
        componentsToUnlink: [
          {
            componentYaml: compassYamlBefore,
          },
        ],
      };
      const result = await findConfigAsCodeFileChanges(event, 'token');

      expect(result).toEqual(expectedResult);
    });

    test('unlinks component and adds the new one when the name changed and id removed', async () => {
      const compassYamlBefore = { name: 'name', id: 'id' };
      const compassYamlAfter = { name: 'name-2' };
      mockModifiedDiff(compassYamlBefore, compassYamlAfter);

      const expectedResult: ComponentChanges = {
        componentsToCreate: [
          {
            componentYaml: compassYamlAfter,
            absoluteFilePath: 'compass.yml',
            filePath: '/compass.yml',
            previousFilePath: '/compass.yml',
          },
        ],
        componentsToUpdate: [],
        componentsToUnlink: [
          {
            componentYaml: compassYamlBefore,
          },
        ],
      };
      const result = await findConfigAsCodeFileChanges(event, 'token');

      expect(result).toEqual(expectedResult);
    });

    test('updates component when the file changed but name is the same', async () => {
      const compassYamlBefore = { name: 'name', description: 'desc1' };
      const compassYamlAfter = { name: 'name', description: 'desc2' };

      mockModifiedDiff(compassYamlBefore, compassYamlAfter);

      const expectedResult: ComponentChanges = {
        componentsToCreate: [],
        componentsToUpdate: [
          {
            componentYaml: compassYamlAfter,
            absoluteFilePath: 'compass.yml',
            filePath: '/compass.yml',
            previousFilePath: '/compass.yml',
          },
        ],
        componentsToUnlink: [],
      };
      const result = await findConfigAsCodeFileChanges(event, 'token');

      expect(result).toEqual(expectedResult);
    });

    test('updates component when the name changed', async () => {
      const compassYamlBefore = { name: 'name' };
      const compassYamlAfter = { name: 'name2' };
      mockModifiedDiff(compassYamlBefore, compassYamlAfter);

      const expectedResult: ComponentChanges = {
        componentsToCreate: [],
        componentsToUpdate: [
          {
            componentYaml: compassYamlAfter,
            absoluteFilePath: 'compass.yml',
            filePath: '/compass.yml',
            previousFilePath: '/compass.yml',
          },
        ],
        componentsToUnlink: [],
      };
      const result = await findConfigAsCodeFileChanges(event, 'token');

      expect(result).toEqual(expectedResult);
    });

    test('updates component by name when the config file moved with minimum changes and treated by Gitlab as rename', async () => {
      const compassYamlBefore = { name: 'name' };
      const compassYamlAfter = { name: 'name' };
      mockMovedDiffAsRename(compassYamlBefore, compassYamlAfter);

      const expectedResult: ComponentChanges = {
        componentsToCreate: [],
        componentsToUpdate: [
          {
            componentYaml: compassYamlAfter,
            absoluteFilePath: 'folder/compass.yml',
            filePath: '/folder/compass.yml',
            previousFilePath: '/compass.yml',
          },
        ],
        componentsToUnlink: [],
      };
      const result = await findConfigAsCodeFileChanges(event, 'token');

      expect(result).toEqual(expectedResult);
    });

    test('updates component by name when the config file moved with major changes and treated by Gitlab as two files - deleted and added', async () => {
      const compassYamlBefore = { name: 'name' };
      const compassYamlAfter = { name: 'name' };
      mockMovedDiffAsAddedAndDeleted(compassYamlBefore, compassYamlAfter);

      const expectedResult: ComponentChanges = {
        componentsToCreate: [],
        componentsToUpdate: [
          {
            componentYaml: compassYamlAfter,
            absoluteFilePath: 'compass.yml',
            filePath: '/compass.yml',
            previousFilePath: '/folder/compass.yml',
          },
        ],
        componentsToUnlink: [],
      };
      const result = await findConfigAsCodeFileChanges(event, 'token');

      expect(result).toEqual(expectedResult);
    });

    test('updates component by id when the config file moved with minimum changes and treated by Gitlab as rename', async () => {
      const compassYamlBefore = { id: 'id' };
      const compassYamlAfter = { id: 'id' };
      mockMovedDiffAsRename(compassYamlBefore, compassYamlAfter);

      const expectedResult: ComponentChanges = {
        componentsToCreate: [],
        componentsToUpdate: [
          {
            componentYaml: compassYamlAfter,
            absoluteFilePath: 'folder/compass.yml',
            filePath: '/folder/compass.yml',
            previousFilePath: '/compass.yml',
          },
        ],
        componentsToUnlink: [],
      };
      const result = await findConfigAsCodeFileChanges(event, 'token');

      expect(result).toEqual(expectedResult);
    });

    test('updates component by id when the config file moved with major changes and treated by Gitlab as two files - deleted and added', async () => {
      const compassYamlBefore = { id: 'id' };
      const compassYamlAfter = { id: 'id' };
      mockMovedDiffAsAddedAndDeleted(compassYamlBefore, compassYamlAfter);

      const expectedResult: ComponentChanges = {
        componentsToCreate: [],
        componentsToUpdate: [
          {
            componentYaml: compassYamlAfter,
            absoluteFilePath: 'compass.yml',
            filePath: '/compass.yml',
            previousFilePath: '/folder/compass.yml',
          },
        ],
        componentsToUnlink: [],
      };
      const result = await findConfigAsCodeFileChanges(event, 'token');

      expect(result).toEqual(expectedResult);
    });

    test('unlinks component and adds the new one when the config file has changed name and moved with minimum changes, that treated by Gitlab as rename', async () => {
      const compassYamlBefore = { name: 'name' };
      const compassYamlAfter = { name: 'name2' };
      mockMovedDiffAsRename(compassYamlBefore, compassYamlAfter);

      const expectedResult: ComponentChanges = {
        componentsToCreate: [
          {
            componentYaml: compassYamlAfter,
            absoluteFilePath: 'folder/compass.yml',
            filePath: '/folder/compass.yml',
            previousFilePath: '/compass.yml',
          },
        ],
        componentsToUpdate: [],
        componentsToUnlink: [
          {
            componentYaml: compassYamlBefore,
          },
        ],
      };
      const result = await findConfigAsCodeFileChanges(event, 'token');

      expect(result).toEqual(expectedResult);
    });

    test('unlinks component and adds the new one when the config file has changed name and moved with major changes, that treated by Gitlab as two files - deleted and added', async () => {
      const compassYamlBefore = { name: 'name' };
      const compassYamlAfter = { name: 'name2' };
      mockMovedDiffAsAddedAndDeleted(compassYamlBefore, compassYamlAfter);

      const expectedResult: ComponentChanges = {
        componentsToCreate: [
          {
            componentYaml: compassYamlAfter,
            absoluteFilePath: 'compass.yml',
            filePath: '/compass.yml',
          },
        ],
        componentsToUpdate: [],
        componentsToUnlink: [
          {
            componentYaml: compassYamlBefore,
            filePath: '/folder/compass.yml',
          },
        ],
      };
      const result = await findConfigAsCodeFileChanges(event, 'token');

      expect(result).toEqual(expectedResult);
    });

    test('unlinks component and adds the new one when the config file has same name, removed id and moved with minimum changes that treated by Gitlab as rename', async () => {
      const compassYamlBefore = { name: 'name', id: 'id' };
      const compassYamlAfter = { name: 'name' };
      mockMovedDiffAsRename(compassYamlBefore, compassYamlAfter);

      const expectedResult: ComponentChanges = {
        componentsToCreate: [
          {
            componentYaml: compassYamlAfter,
            absoluteFilePath: 'folder/compass.yml',
            filePath: '/folder/compass.yml',
            previousFilePath: '/compass.yml',
          },
        ],
        componentsToUpdate: [],
        componentsToUnlink: [
          {
            componentYaml: compassYamlBefore,
          },
        ],
      };
      const result = await findConfigAsCodeFileChanges(event, 'token');

      expect(result).toEqual(expectedResult);
    });

    test('unlinks component and adds the new one when the config file has same name, removed id and moved with major changes that treated by Gitlab as two files - deleted and added', async () => {
      const compassYamlBefore = { name: 'name', id: 'id' };
      const compassYamlAfter = { name: 'name' };
      mockMovedDiffAsAddedAndDeleted(compassYamlBefore, compassYamlAfter);

      const expectedResult: ComponentChanges = {
        componentsToCreate: [
          {
            componentYaml: compassYamlAfter,
            absoluteFilePath: 'compass.yml',
            filePath: '/compass.yml',
          },
        ],
        componentsToUpdate: [],
        componentsToUnlink: [
          {
            componentYaml: compassYamlBefore,
            filePath: '/folder/compass.yml',
          },
        ],
      };
      const result = await findConfigAsCodeFileChanges(event, 'token');

      expect(result).toEqual(expectedResult);
    });
  });
});
