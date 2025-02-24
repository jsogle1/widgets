import { React, type AllWidgetProps } from 'jimu-core';

const Widget = (props: AllWidgetProps<{}>) => {
  return (
    <div className="widget-dasymetric jimu-widget" style={{ padding: '10px' }}>
      <h1>Buffer Dasymetric Widget</h1>
      <p>Testing minimal render without map or dependencies.</p>
    </div>
  );
};

export default Widget;
