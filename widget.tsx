import { React, type AllWidgetProps } from 'jimu-core';
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis';

interface IState {
  jimuMapView: JimuMapView | null;
}

const Widget = (props: AllWidgetProps<{}>) => {
  const [state, setState] = React.useState<IState>({
    jimuMapView: null,
  });

  const activeViewChangeHandler = (jmv: JimuMapView) => {
    console.log('Map view received:', jmv ? 'Valid' : 'Null');
    if (!jmv) {
      console.error('No map view available. Check hardcoded Map widget ID (widget_6).');
      return;
    }
    setState({ jimuMapView: jmv });
  };

  return (
    <div className="widget-dasymetric jimu-widget" style={{ padding: '10px' }}>
      <h1>Buffer Dasymetric Widget</h1>
      <p>Map integration test. Using hardcoded Map widget ID: widget_6.</p>
      <JimuMapViewComponent
        useMapWidgetId="widget_6"  // Hardcoded Map widget ID
        onActiveViewChange={activeViewChangeHandler}
      />
    </div>
  );
};

export default Widget;
  );
};

export default Widget;
