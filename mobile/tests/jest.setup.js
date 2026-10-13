// Required by React 19's test renderers so state updates inside tests are correctly tracked as
// act()-wrapped; without this, @testing-library/react-native's renderHook silently fails.
global.IS_REACT_ACT_ENVIRONMENT = true;
