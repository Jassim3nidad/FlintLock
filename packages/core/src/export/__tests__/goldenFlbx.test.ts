import { configureTestPlatform, resetPlatformForTests } from '../../testing/configureTestPlatform';
import { describeGoldenFlbxCheck } from '../../testing/goldenFlbxCheck';

beforeEach(() => configureTestPlatform());
afterEach(() => resetPlatformForTests());

describeGoldenFlbxCheck('reference (Node)');
