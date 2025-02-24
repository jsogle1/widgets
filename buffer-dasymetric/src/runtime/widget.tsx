import { React, type AllWidgetProps } from 'jimu-core';

const Widget = (props: AllWidgetProps<{}>) => {
  return (
    <div className="widget-dasymetric jimu-widget" style={{ padding: '10px' }}>
      <h1>Buffer Dasymetric Widget</h1>
      <p>This is a test. Widget loaded successfully!</p>
    </div>
  );
};

export default Widget;