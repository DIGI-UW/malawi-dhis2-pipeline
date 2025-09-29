const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { createOrganizationUnitsLogic } = require('../jobs/04-check-and-setup-metadata');

chai.use(chaiAsPromised);
const { expect } = chai;

describe('createOrganizationUnitsLogic', () => {
  const mockState = {
    config: {
      maxLevels: 5,
    },
  };

  // Mock implementation of the OpenFn `get` function for testing.
  const mockGet = async (resource, options) => {
    // For these tests, we'll assume the org unit never exists.
    return { organisationUnits: [] };
  };

  // Mock implementation of the OpenFn `create` function for testing.
  const mockCreate = async (resource, payload) => {
    // Simulate a successful creation.
    return { response: { uid: `id_${payload.name}` } };
  };

  it('should throw a fatal error if a parent org unit cannot be found', async () => {
    const orgUnitStructures = [
      { name: 'ChildUnit', level: 2, parent: 'NonExistentParent', code: 'C01' },
    ];

    // We expect this promise to be rejected with a specific error message.
    await expect(
      createOrganizationUnitsLogic(
        orgUnitStructures,
        mockState,
        mockGet,
        mockCreate
      )
    ).to.be.rejectedWith(
      "Parent 'NonExistentParent' not found for 'ChildUnit'. Cannot create child OU."
    );
  });
}); 