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
      console.error('No map view available. Please link a Map widget.');
      return;
    }
    setState({ jimuMapView: jmv });
  };

  return (
    <div className="widget-dasymetric jimu-widget" style={{ padding: '10px' }}>
      <h1>Buffer Dasymetric Widget</h1>
      <p>Map integration test. Click a Map widget to link.</p>
      {!props.useMapWidgetIds?.length ? (
        <p>Please add a Map widget and link it to this widget.</p>
      ) : (
        <JimuMapViewComponent
          useMapWidgetId={props.useMapWidgetIds?.[0]}
          onActiveViewChange={activeViewChangeHandler}
        />
      )}
    </div>
  );
};

export default Widget;
