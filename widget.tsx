import { React, type AllWidgetProps } from 'jimu-core';

interface IConfig {
  bufferDistances: number[];
}

const Widget = (props: AllWidgetProps<IConfig>) => {
  console.log('Widget initializing with props:', props);
  try {
    return (
      <div className="widget-dasymetric jimu-widget" style={{ padding: '10px' }}>
        <h1>Buffer Dasymetric Widget</h1>
        <p>This is a test. Widget loaded successfully!</p>
        <p>Props: {JSON.stringify(props)}</p>
      </div>
    );
  } catch (error) {
    console.error('Render error:', error);
    return (
      <div className="widget-dasymetric jimu-widget" style={{ padding: '10px' }}>
        <h1>Error</h1>
        <p>Failed to render: {error.message}</p>
      </div>
    );
  }
};

export default Widget;
