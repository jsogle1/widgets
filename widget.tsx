import { React, type AllWidgetProps } from 'jimu-core';
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import Point from '@arcgis/core/geometry/Point';
import { TextInput, Button, Alert } from 'jimu-ui';

interface IConfig {
  bufferDistances: number[];
}

interface IState {
  jimuMapView: JimuMapView | null;
  latitude: string;
  longitude: string;
  siteName: string;
  errorMessage: string | null;
  isLoading: boolean;
}

const Widget = (props: AllWidgetProps<IConfig>) => {
  const [state, setState] = React.useState<IState>({
    jimuMapView: null,
    latitude: '',
    longitude: '',
    siteName: '',
    errorMessage: null,
    isLoading: false,
  });

  const activeViewChangeHandler = (jmv: JimuMapView) => {
    console.log('Map view received:', jmv ? 'Valid' : 'Null');
    if (!jmv) {
      console.error('No map view available. Check hardcoded Map widget ID (widget_6).');
      setState({ ...state, errorMessage: 'No map view available. Check Map widget linkage.' });
      return;
    }
    setState({ ...state, jimuMapView: jmv });
    jmv.view.when(() => {
      console.log('Map view fully loaded');
    }).catch((err) => {
      console.error('Map view failed to load:', err);
      setState({ ...state, errorMessage: 'Failed to load map view: ' + err.message });
    });
  };

  const processPoint = async (point: Point) => {
    if (!state.jimuMapView) {
      setState({ ...state, errorMessage: 'Map view not loaded. Add a Map widget.' });
      return;
    }
    if (!state.siteName.trim()) {
      setState({ ...state, errorMessage: 'Please enter a site name before processing.' });
      return;
    }

    setState({ ...state, isLoading: true, errorMessage: null });
    const bufferDistances = props.config?.bufferDistances || [0.25, 0.5, 1, 2, 3, 4];
    const censusLayer = state.jimuMapView.view.map.allLayers.find((layer) => layer.title === 'Census') as FeatureLayer;

    if (!censusLayer) {
      setState({ ...state, errorMessage: 'Census layer not found in the map.', isLoading: false });
      return;
    }

    const buffers = bufferDistances.map((distance) =>
      geometryEngine.buffer(point, distance, 'miles')
    );

    const query = censusLayer.createQuery();
    query.geometry = buffers[buffers.length - 1]; // Use largest buffer for simplicity
    try {
      const result = await censusLayer.queryFeatures(query);
      if (!result.features.length) {
        setState({ ...state, errorMessage: 'No census features found within the largest buffer.', isLoading: false });
        return;
      }

      setState({ ...state, isLoading: false, errorMessage: null });
      console.log('Buffer analysis completed with:', result.features.length, 'features');

      // Simple population estimate (example—replace with actual dasymetric logic)
      const populationEstimate = result.features.reduce((sum, feature) => sum + (feature.attributes?.POPULATION || 0), 0);
      console.log('Estimated population within buffer:', populationEstimate);
    } catch (error) {
      console.error('Buffer processing error:', error);
      setState({ ...state, errorMessage: `Error processing data: ${error.message}`, isLoading: false });
    }
  };

  const handleCoordinateSubmit = async () => {
    const { latitude, longitude } = state;

    if (!latitude.trim() || !longitude.trim()) {
      setState({ ...state, errorMessage: 'Please enter both latitude and longitude.' });
      return;
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setState({ ...state, errorMessage: 'Invalid coordinates. Latitude: -90 to 90, Longitude: -180 to 180.' });
      return;
    }

    const point = new Point({
      latitude: lat,
      longitude: lon,
      spatialReference: { wkid: 4326 },
    });

    await processPoint(point);
  };

  return (
    <div className="widget-dasymetric jimu-widget" style={{ padding: '10px' }}>
      <h1>Buffer Dasymetric Widget</h1>
      <JimuMapViewComponent
        useMapWidgetId="widget_6"  // Hardcoded Map widget ID
        onActiveViewChange={activeViewChangeHandler}
      />

      <div style={{ marginTop: '10px' }}>
        <h4>Enter Coordinates and Site Name</h4>
        <TextInput
          placeholder="Latitude (e.g., 34.0522)"
          value={state.latitude}
          onChange={(e) => setState({ ...state, latitude: e.target.value })}
          style={{ marginRight: '10px', width: '150px' }}
        />
        <TextInput
          placeholder="Longitude (e.g., -118.2437)"
          value={state.longitude}
          onChange={(e) => setState({ ...state, longitude: e.target.value })}
          style={{ marginRight: '10px', width: '150px' }}
        />
        <TextInput
          placeholder="Site Name (e.g., Site A)"
          value={state.siteName}
          onChange={(e) => setState({ ...state, siteName: e.target.value })}
          style={{ marginRight: '10px', width: '150px' }}
        />
        <Button onClick={handleCoordinateSubmit} disabled={state.isLoading}>
          {state.isLoading ? 'Processing...' : 'Buffer Coordinates'}
        </Button>
      </div>

      {state.errorMessage && (
        <Alert
          type="error"
          text={state.errorMessage}
          withIcon={true}
          closable={true}
          onClose={() => setState({ ...state, errorMessage: null })}
          style={{ marginTop: '10px' }}
        />
      )}

      {state.isLoading && <div style={{ marginTop: '10px' }}>Analyzing data...</div>}
    </div>
  );
};

export default Widget;
