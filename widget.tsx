import { React, type AllWidgetProps } from 'jimu-core';
import { JimuMapViewComponent, JimuMapView } from 'jimu-arcgis';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import Point from '@arcgis/core/geometry/Point';
import { TextInput, Button, Alert } from 'jimu-ui';

interface IConfig {
  bufferDistances: number[];
}

interface IState {
  jimuMapView?: JimuMapView;
  results?: any[];
  latitude: string;
  longitude: string;
  siteName: string;
  errorMessage: string | null;
  isLoading: boolean;
}

const Widget = (props: AllWidgetProps<IConfig>) => {
  console.log('Widget initializing with props:', props);
  const [state, setState] = React.useState<IState>({
    latitude: '',
    longitude: '',
    siteName: '',
    errorMessage: null,
    isLoading: false,
  });

  const activeViewChangeHandler = (jmv: JimuMapView) => {
    console.log('Map view received:', jmv ? 'Valid' : 'Null');
    if (!jmv) {
      setState({ ...state, errorMessage: 'No map view available. Please add and link a Map widget.' });
      return;
    }
    setState({ ...state, jimuMapView: jmv });
    jmv.view.when(() => {
      console.log('Map view fully loaded');
    }).catch((err) => {
      console.error('Map view failed to load:', err);
      setState({ ...state, errorMessage: 'Failed to load map view: ' + err.message });
    });
    jmv.view.on('click', async (event) => {
      console.log('Map clicked at:', event.mapPoint);
      if (!state.siteName.trim()) {
        setState({ ...state, errorMessage: 'Please enter a site name before clicking the map.' });
        return;
      }
      await processPoint(event.mapPoint, jmv);
    });
  };

  const processPoint = async (point: Point, jmv: JimuMapView) => {
    console.log('Processing point:', point);
    setState({ ...state, isLoading: true, errorMessage: null });
    const bufferDistances = props.config.bufferDistances || [0.25, 0.5, 1, 2, 3, 4];
    const censusLayer = jmv.view.map.allLayers.find((layer) => layer.title === 'Census') as FeatureLayer;

    if (!censusLayer) {
      setState({ ...state, errorMessage: 'Census layer not found in the map.', isLoading: false });
      return;
    }

    console.log('Census layer:', censusLayer.title);
    const buffers = bufferDistances.map((distance) =>
      geometryEngine.buffer(point, distance, 'miles')
    );

    const query = censusLayer.createQuery();
    query.geometry = buffers[buffers.length - 1];
    try {
      console.log('Querying features...');
      const result = await censusLayer.queryFeatures(query);
      console.log('Features found:', result.features.length);
      if (!result.features.length) {
        setState({ ...state, errorMessage: 'No census features found within the largest buffer.', isLoading: false });
        return;
      }

      const processedResults = await Promise.all(
        buffers.map(async (buffer, index) => {
          const clippedFeatures = result.features.map((feature) => {
            const clippedGeom = geometryEngine.intersect(feature.geometry, buffer);
            if (!clippedGeom) return null;

            const clipAcres = geometryEngine.planarArea(clippedGeom, 'acres');
            const originalAcres = feature.attributes.ACRES;
            const ratio = clipAcres / originalAcres;
            const clipPop = feature.attributes.TOTALPOP * ratio;

            return {
              geometry: clippedGeom,
              attributes: {
                Clip_Acres: clipAcres,
                Clip_Pop: clipPop,
                Buffer_Distance: bufferDistances[index],
              },
            };
          }).filter(Boolean);

          if (!clippedFeatures.length) return null;

          const dissolvedGeom = geometryEngine.union(clippedFeatures.map((f) => f.geometry));
          const totalPop = clippedFeatures.reduce((sum, f) => sum + f.attributes.Clip_Pop, 0);

          return {
            bufferDistance: bufferDistances[index],
            dissolvedGeometry: dissolvedGeom,
            totalClipPop: totalPop,
          };
        })
      );

      const validResults = processedResults.filter(Boolean);
      if (!validResults.length) {
        setState({ ...state, errorMessage: 'No valid results calculated.', isLoading: false });
        return;
      }

      setState({ ...state, results: validResults, errorMessage: null, isLoading: false });
    } catch (error) {
      console.error('Processing error:', error);
      setState({ ...state, errorMessage: `Error processing data: ${error.message}`, isLoading: false });
    }
  };

  const handleCoordinateSubmit = async () => {
    console.log('Coordinate submit triggered');
    const { latitude, longitude, jimuMapView, siteName } = state;

    if (!jimuMapView) {
      setState({ ...state, errorMessage: 'Map view not loaded. Add a Map widget.' });
      return;
    }

    if (!siteName.trim()) {
      setState({ ...state, errorMessage: 'Please enter a site name.' });
      return;
    }

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

    await processPoint(point, jimuMapView);
  };

  const exportToCSV = () => {
    console.log('Exporting CSV');
    const { results, siteName } = state;
    if (!results || !siteName.trim()) {
      setState({ ...state, errorMessage: 'No results or site name available for export.' });
      return;
    }

    const headers = ['Site_Name', 'Buffer_Distance_Miles', 'Clip_Pop'];
    const rows = results.map((result) => [
      siteName,
      result.bufferDistance,
      result.totalClipPop.toFixed(2),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${siteName}_buffer_analysis.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="widget-dasymetric jimu-widget" style={{ padding: '10px' }}>
      {console.log('Rendering widget, map IDs:', props.useMapWidgetIds)}
      {!props.useMapWidgetIds?.length && (
        <Alert
          type="warning"
          text="Please add a Map widget and link it to this widget."
          withIcon={true}
          style={{ marginBottom: '10px' }}
        />
      )}
      <JimuMapViewComponent
        useMapWidgetId={props.useMapWidgetIds?.[0]}
        onActiveViewChange={activeViewChangeHandler}
      />

      <div style={{ marginBottom: '10px' }}>
        <h4>Enter Coordinates and Site Name</h4>
        <TextInput
          id="latitude-input"
          name="latitude"
          placeholder="Latitude (e.g., 34.0522)"
          value={state.latitude}
          onChange={(e) => setState({ ...state, latitude: e.target.value })}
          style={{ marginRight: '10px', width: '150px' }}
        />
        <TextInput
          id="longitude-input"
          name="longitude"
          placeholder="Longitude (e.g., -118.2437)"
          value={state.longitude}
          onChange={(e) => setState({ ...state, longitude: e.target.value })}
          style={{ marginRight: '10px', width: '150px' }}
        />
        <TextInput
          id="siteName-input"
          name="siteName"
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
          style={{ marginBottom: '10px' }}
        />
      )}

      {state.isLoading && <div>Analyzing data...</div>}

      {state.results && !state.isLoading && (
        <div>
          <h3>Buffer Results for {state.siteName}</h3>
          <ul>
            {state.results.map((result, index) => (
              <li key={index}>
                {result.bufferDistance} miles: Population = {result.totalClipPop.toFixed(2)}
              </li>
            ))}
          </ul>
          <Button onClick={exportToCSV}>Export to CSV</Button>
        </div>
      )}
    </div>
  );
};

export default Widget;
