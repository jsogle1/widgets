import { React, type AllWidgetProps } from 'jimu-core';
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis';

interface IState {
  jimuMapView: JimuMapView | null;
  mapWidgetIds: string[] | undefined;
}

const Widget = (props: AllWidgetProps<{}>) => {
  const [state, setState] = React.useState<IState>({
    jimuMapView: null,
    mapWidgetIds: props.useMapWidgetIds,
  });

  React.useEffect(() => {
    console.log('Widget props:', props);
    console.log('All widget IDs:', props.allWidgetIds);
    console.log('Map widget IDs:', props.useMapWidgetIds);
    setState({ ...state, mapWidgetIds: props.useMapWidgetIds });
  }, [props]);

  const activeViewChangeHandler = (jmv: JimuMapView) => {
    console.log('Map view received:', jmv ? 'Valid' : 'Null');
    if (!jmv) {
      console.error('No map view available. Check Map widget ID or linkage.');
      return;
    }
    setState({ ...state, jimuMapView: jmv });
  };

  return (
    <div className="widget-dasymetric jimu-widget" style={{ padding: '10px' }}>
      <h1>Buffer Dasymetric Widget</h1>
      <p>Testing Map widget ID detection. Link or add a Map widget.</p>
      <p>Map Widget IDs: {state.mapWidgetIds ? state.mapWidgetIds.join(', ') : 'None found'}</p>
      <p>All Widget IDs: {props.allWidgetIds ? props.allWidgetIds.join(', ') : 'None found'}</p>
      <JimuMapViewComponent
        useMapWidgetId={props.useMapWidgetIds?.[0]} // Dynamic linkage
        onActiveViewChange={activeViewChangeHandler}
      />
    </div>
  );
};

export default Widget;
